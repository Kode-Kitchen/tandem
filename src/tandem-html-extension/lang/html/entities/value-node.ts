import { decode } from "ent";
import { Action, inject } from "tandem-common";
import { HTMLFile } from "tandem-html-extension/models/html-file";
import { EntityMetadata } from "tandem-common/lang/entities";
import { HTMLNodeEntity } from "./node";
import { IHTMLNodeEntity } from "./base";
import { NodeSection, IDOMSection } from "tandem-html-extension/dom";
import { DEPENDENCIES_NS, Dependencies, Injector } from "tandem-common/dependencies";
import { HTMLNodeExpression, IHTMLValueNodeExpression } from "tandem-html-extension/lang";

export abstract class HTMLValueNodeEntity<T extends HTMLNodeExpression & IHTMLValueNodeExpression> extends HTMLNodeEntity<T> implements IHTMLNodeEntity {

  private _value: any;

  protected mapSourceChildren() {
    return [];
  }

  get value(): any {
    return this._value;
  }

  set value(value: any) {
    this._value = value;
    if (this.section instanceof NodeSection) {
      this.section.targetNode.nodeValue = decode(value.trim());
    }
  }

  public async evaluate(context: any) {
    await super.evaluate(context);
    this.value = this.source.value;
  }

  protected abstract createSection();
}