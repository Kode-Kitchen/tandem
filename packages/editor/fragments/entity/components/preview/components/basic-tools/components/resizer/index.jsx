import './index.scss';

import React from 'react';
import { startDrag } from 'common/utils/component';
import EntityGuide from './guides/entity';
import PathComponent from './path';
import RulerComponent from './ruler';
import GuideComponent from './guide';
import ObservableObject from 'common/object/observable';
import CallbackNotifier from 'common/notifiers/callback';
import { divideStyle } from 'common/utils/html';

import { ENTITY_PREVIEW_DOUBLE_CLICK } from 'editor/message-types';

const POINT_STROKE_WIDTH = 1;
const POINT_RADIUS       = 2;
const PADDING            = 6;
const SNAP_MARGIN        = 5;


class ResizerComponent extends React.Component {

  constructor() {
    super();
    this.state = {
      moving: false
    };
  }

  startDragging(event) {
    var selection = this.props.selection;

    var guide = EntityGuide.create(
      this.props.app.rootEntity.flatten().filter((entity) => {
        return !~this.props.app.selection.indexOf(entity);
      }),
      SNAP_MARGIN / this.props.zoom
    );

    var style = selection.preview.getStyle();

    var sx2 = style.left;
    var sy2 = style.top;

    this.setState({ dragging: true });

    this._dragger = startDrag(event, (event, info) => {

      if (!this.targetPreview.getCapabilities().movable) return;

      var nx = sx2 + info.delta.x / this.props.zoom;
      var ny = sy2 + info.delta.y / this.props.zoom;

      // guide.snap - todo
      var bounds = {
        left   : nx,
        top    : ny,
        width  : style.width,
        height : style.height
      };

      this.setState({
        dragBounds: bounds
      });

      this.moveTarget(bounds.left, bounds.top);
    }, () => {
      this.setState({ dragging: false });
      this._dragger = void 0;
    });
  }


  updatePoint(point) {
    var selection = this.props.selection;

    var style = selection.preview.getStyle(true);

    var props = {
      left: style.left,
      top: style.top,
      width: style.width,
      height: style.height
    };

    if (/^n/.test(point.id)) {
      props.top = point.currentStyle.top + point.top / this.props.zoom;
      props.height = point.currentStyle.height - point.top / this.props.zoom;
    }

    if (/e$/.test(point.id)) {
      props.width = point.left / this.props.zoom;
    }

    if (/^s/.test(point.id)) {
      props.height = point.top / this.props.zoom;
    }

    if (/w$/.test(point.id)) {
      props.width = point.currentStyle.width - point.left / this.props.zoom;
      props.left  = point.currentStyle.left + point.left / this.props.zoom;
    }

    if (point.keepAspectRatio) {
      // todo
    }

    this._isMoving();
    this._isResizing();

    selection.preview.setBounds(props);
  }

  onDoubleClick(event) {
    this.props.app.notifier.notify({
      type   : ENTITY_PREVIEW_DOUBLE_CLICK,
      selection : this.props.selection
    });
  }

  componentDidMount() {
    this.props.app.notifier.push(this);
  }

  notify(message) {
    if (message.type !== 'keydown') return;
    this.onKeyDown(message);
  }

  componentWillUnmount() {
    if (this._dragger) this._dragger.dispose();
    this.props.app.notifier.remove(this);
  }

  onKeyDown(message) {

    var selection = this.props.app.selection;
    var style = selection.preview.getStyle();

    var left = style.left;
    var top  = style.top;

    if (message.keyCode === 38) {
      top--;
    } else if (message.keyCode === 40) {
      top++;
    } else if (message.keyCode === 37) {
      left--;
    } else if (message.keyCode === 39) {
      left++;
    } else {
      return;
    }

    selection.preview.setPositionFromAbsolutePoint({
      top  : top,
      left : left
    });

    this._isMoving();
    event.preventDefault();
  }

  get targetPreview() {
    return this.props.selection.preview;
  }

  moveTarget(left, top) {
    this._isMoving();
    this.props.app.selection.preview.setPositionFromAbsolutePoint({
      left : left,
      top  : top
    });
  }

  _isMoving() {
    return;
    clearTimeout(this._movingTimer);
    this.targetPreview.setProperties({ moving: true });
    this._movingTimer = setTimeout(() => {
      this.targetPreview.setProperties({ moving: false, dragBounds: void 0 });
    }, 1000);
  }

  _isResizing() {
    return;
    clearTimeout(this._movingTimer);
    this.targetPreview.setProperties({ resizing: true });
    this._movingTimer = setTimeout(() => {
      this.targetPreview.setProperties({ resizing: false });
    }, 1000);
  }

  render() {

    var pointRadius = (this.props.pointRadius || POINT_RADIUS);
    var strokeWidth = (this.props.strokeWidth || POINT_STROKE_WIDTH);

    var selection = this.props.selection;
    var preview = selection.preview;
    var rect = preview.getBoundingRect(true);
    var actStyle = preview.getStyle(true);
    var capabilities = preview.getCapabilities();

    var cw = (pointRadius + strokeWidth * 2) * 2;

    // offset stroke
    var resizerStyle = {
      left     : rect.left - cw / 2 + strokeWidth,
      top      : rect.top - cw / 2 + strokeWidth
    }

    var sections = {};

    if (this.targetPreview.moving && false) {
      sections.guides = <div>
        <RulerComponent {...this.props} bounds={resizerStyle} />
        { this.state.dragBounds ? <GuideComponent {...this.props} bounds={this.state.dragBounds} /> : void 0 }
      </div>;
    }

    if (this.targetPreview.resizing) {
      sections.size = <span  className='m-resizer-component--size' style={{
            left: rect.left + rect.width / 2,
            top : rect.top + rect.height
          }}>{Math.round(actStyle.width)} &times; {Math.round(actStyle.height)}</span>;
    }

    var movable = capabilities.movable;

      var points = [
        ['nw', movable == true, 0, 0],
        ['n', movable === true, rect.width / 2, 0],
        ['ne', movable === true, rect.width, 0],
        ['e', true, rect.width, rect.height / 2],
        ['se', true, rect.width, rect.height],
        ['s', true, rect.width / 2, rect.height],
        ['sw', movable === true, 0, rect.height],
        ['w', movable === true, 0, rect.height / 2]
      ].map(([id, show, left, top], i) => {

        var ret = ObservableObject.create({
          id: id,
          index: i,
          show: show,
          currentStyle: actStyle,
          left: left,
          top: top
        });

        ret.notifier = CallbackNotifier.create(this.updatePoint.bind(this, ret));
        return ret;
      });

      sections.resizer = <div ref='selection' className='m-resizer-component--selection' style={resizerStyle}
                              onMouseDown={this.startDragging.bind(this)}
                              onDoubleClick={this.onDoubleClick.bind(this)}>
        <PathComponent showPoints={capabilities.resizable && !this.state.dragging} zoom={this.props.zoom} points={points}
                       strokeWidth={strokeWidth} pointRadius={pointRadius}/>
      </div>;


    return <div className='m-resizer-component'>
      { sections.resizer }
      { sections.guides  }
      { sections.size    }
    </div>;
  }
}

export default ResizerComponent;