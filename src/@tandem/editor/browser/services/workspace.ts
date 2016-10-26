
import { WrapBus } from "mesh";
import { MetadataKeys } from "@tandem/editor/browser/constants";
import {
  BaseRenderer,
  SyntheticDOMNode,
  SyntheticBrowser,
  SyntheticDOMElement,
  SyntheticDOMRenderer,
  BaseDecoratorRenderer,
  RemoteSyntheticBrowser,
  SyntheticRendererAction,
} from "@tandem/synthetic-browser";
import { Workspace } from "@tandem/editor/browser/models";
import { ApplyEditAction, FileEditorDependency } from "@tandem/sandbox";
import { FrontEndApplication } from "@tandem/editor/browser/application";
import { pointerToolDependency } from "@tandem/editor/browser/models/pointer-tool";
import { CoreApplicationService } from "@tandem/core";
import { IEditorBrowserConfig } from "@tandem/editor/browser/config";
import { WorkspaceToolFactoryDependency } from "@tandem/editor/browser/dependencies";
import { SetToolAction, ZoomAction, SetZoomAction, DocumentFileAction } from "@tandem/editor/browser/actions";

import {
  File,
  tween,
  Action,
  Logger,
  inject,
  loggable,
  IDisposable,
  easeOutCubic,
  BoundingRect,
  DSFindAction,
  watchProperty,
  Dependencies,
  InitializeAction,
  OpenProjectAction,
  DependenciesDependency,
  BaseApplicationService,
  ApplicationServiceDependency,
  GetPrimaryProjectFilePathAction,
} from "@tandem/common";

export class WorkspaceService extends CoreApplicationService<IEditorBrowserConfig> {
  public logger: Logger;

  private _workspace: Workspace;

  @inject(DependenciesDependency.ID)
  public app: any;
  private _dependencies: Dependencies;
  private _tweener: IDisposable;
  private _zoomTimeout: any;

  async [InitializeAction.INITIALIZE](action: Action) {
    await this._loadWorkspaces();
  }

  async _loadWorkspaces() {

    const filePath = await GetPrimaryProjectFilePathAction.execute(this.bus);
    console.log(filePath);

    if (1 + 1) return;
    // if (this.app.workspace && this.app.workspace.browser.location.toString() === filePath) return;

    this.logger.info("loading project file %s", filePath);

    const workspace = new Workspace();

    const browser = workspace.browser = new RemoteSyntheticBrowser(this._dependencies, new CanvasRenderer(workspace, new SyntheticDOMRenderer()));

    // redundant since the document querier fetches all changes needed by the app -- even
    // changes to things such as style sheets
    // browser.observe({ execute: (action) => {
    //   this.bus.execute(action);
    // }});

    // yuck - fix quick bug to notify of changes to querier since it's async
    workspace.documentQuerier.observe({ execute: (action) => this.bus.execute(action) });
    await browser.open(filePath);

    this.app.workspace = workspace;
    this.bus.register(this.app.workspace);

    await this.bus.execute(new SetToolAction(this._dependencies.query<WorkspaceToolFactoryDependency>(pointerToolDependency.id)));
  }

  async [OpenProjectAction.OPEN_PROJECT_FILE](action: OpenProjectAction) {

    const path = action.filePath;

    // if (!/\.tdm$/.test(path)) {
    //   const body = this.app.workspace.browser.document.body;
    //   const { editor } = body.firstChild.module;

    //   editor.edit((edit) => {
    //     const frame = this.app.workspace.browser.document.createElement("artboard");
    //     frame.setAttribute("src", path);
    //     edit.appendChildNode(frame);
    //   });
    // } else {
    //   await this._loadWorkspaces();
    // }

    // if the document is hidden, then notify the back-end
    // that there is no visible tandem window, so it should open another
    // browser tab
    return !document.hidden;
  }

  [ZoomAction.ZOOM](action: ZoomAction) {
    if (this._tweener) this._tweener.dispose();
    const delta = action.delta * this.app.workspace.zoom;

    if (!action.ease) {
      this.app.workspace.zoom += delta;
      this._zooming();
      return;
    }

    this._tweener = tween(this.app.workspace.zoom, this.app.workspace.zoom + delta, 200, (value) => {
      this.app.workspace.zoom = value;
      this._zooming();
    }, easeOutCubic);
  }

  [SetZoomAction.SET_ZOOM](action: SetZoomAction) {
    this.app.workspace.zoom = action.value;
  }

  [ApplyEditAction.APPLY_EDITS]({ edit }: ApplyEditAction) {
    return FileEditorDependency.getInstance(this.app.dependencies).applyEditActions(...edit.actions);
  }


  private _zooming() {
    clearTimeout(this._zoomTimeout);
    this.app.metadata.set(MetadataKeys.ZOOMING, true);
    this.app.bus.execute(new Action("zooming"));
    this._zoomTimeout = setTimeout(() => {
      this.app.metadata.set(MetadataKeys.ZOOMING, false);
      this.app.bus.execute(new Action("zoomingComplete"));
    }, 100);
  }

  [SetToolAction.SET_TOOL](action: SetToolAction) {
    this.app.workspace.currentTool = action.toolFactory.create(this.app.workspace);
  }
}

/**
 * Offset the transform skewing that happens with the editor
 */

class CanvasRenderer extends BaseDecoratorRenderer {
  private _rects: any;

  constructor(readonly workspace: Workspace, _renderer: BaseRenderer) {
    super(_renderer);
    this._rects = {};
  }

  getBoundingRect(uid: string) {
    return this._rects[uid] || BoundingRect.zeros();
  }

  protected onTargetRendererSetRectangles() {
    const offsetRects = {};
    const { transform } = this.workspace;
    const rects = (<BaseRenderer>this._renderer).rects;
    for (const uid in rects) {
      offsetRects[uid] = (<BoundingRect>rects[uid]).move({
        left: -transform.left,
        top: -transform.top
      }).zoom(1 / transform.scale);
    }
    this._rects = offsetRects;
  }
}