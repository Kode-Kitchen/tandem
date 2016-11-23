import { Action } from "@tandem/common";
import { decode } from "ent";
import { camelCase } from "lodash";
import { BaseRenderer } from "../base";
import { CallbackDispatcher } from "@tandem/mesh";
import {
  HTML_XMLNS,
  SVG_XMLNS,
  SVG_TAG_NAMES,
  HTML_VOID_ELEMENTS,
  SyntheticDOMElementMutationTypes,
  SyntheticDOMValueNodeMutationTypes
} from "@tandem/synthetic-browser/dom";

import {
  bindable,
  isMaster,
  Mutation,
  diffArray,
  flattenTree,
  BoundingRect,
  traverseTree,
  RemoveMutation,
  MoveChildMutation,
  InsertChildMutation,
  RemoveChildMutation,
  watchProperty,
  PropertyMutation,
  TreeNodeMutationTypes,
  calculateAbsoluteBounds
} from "@tandem/common";

import {
  DOMNodeType,
  SyntheticDOMNode,
  SyntheticDOMText,
  SyntheticCSSAtRule,
  SyntheticDocument,
  SyntheticDOMElement,
  SyntheticDOMComment,
  SyntheticCSSObject,
  syntheticCSSRuleType,
  SyntheticCSSStyleRule,
  SyntheticDOMContainer,
  SyntheticCSSStyleSheet,
  CSSGroupingRuleMutationTypes,
  SyntheticCSSStyleDeclaration,
  SyntheticDocumentMutationTypes,
  SyntheticCSSStyleRuleMutationTypes,
} from "../../dom";

import { DOMNodeEvent } from "../../messages";

type HTMLElementDictionaryType = {
  [IDentifier: string]: [Node, SyntheticDOMNode]
}
const ss: CSSStyleSheet = null;

type CSSRuleDictionaryType = {
  [IDentifier: string]: [CSSRule, syntheticCSSRuleType]
}

export class SyntheticDOMRenderer extends BaseRenderer {

  private _currentCSSText: string;
  private _firstRender: boolean;
  private _documentElement: HTMLElement;
  private _elementDictionary: HTMLElementDictionaryType;
  private _cssRuleDictionary: CSSRuleDictionaryType;
  private _nativeStyleSheet: CSSStyleSheet;
  private _getComputedStyle: (node: Node) => CSSStyleDeclaration;

  constructor(nodeFactory?: Document, getComputedStyle?: (node: Node) => CSSStyleDeclaration) {
    super(nodeFactory);
    this._getComputedStyle = getComputedStyle || (typeof window !== "undefined" ? window.getComputedStyle.bind(window) : () => {});
  }


  createElement() {
    const element = this.nodeFactory.createElement("div");
    element.innerHTML = this.getElementInnerHTML();
    return element;
  }

  protected onDocumentMutationEvent(mutation: Mutation<any>) {
    super.onDocumentMutationEvent(mutation);

    this.registerStyleSheet();

    // DOM
    if (mutation.type === SyntheticDOMValueNodeMutationTypes.SET_VALUE_NODE_EDIT) {
      const [native, synthetic] = this.getElementDictItem(mutation.target);
      if (native) native.textContent = decode((<PropertyMutation<SyntheticDOMNode>>mutation).newValue);
    }

    if (mutation.type === SyntheticDOMElementMutationTypes.SET_ELEMENT_ATTRIBUTE_EDIT) {
      const { name, newValue, oldName } = <PropertyMutation<SyntheticDOMElement>>mutation;
      const [nativeElement, syntheticElement] = this.getElementDictItem<Element>(mutation.target);
      if (nativeElement) {
        if (newValue == undefined) {
          nativeElement.removeAttribute(name);
        } else {
          nativeElement.setAttribute(name, newValue);
        }
        if (oldName) {
          nativeElement.removeAttribute(oldName);
        }
      }
    }

    if (mutation.type === TreeNodeMutationTypes.NODE_REMOVED) {
      const [native, synthetic] = this.getElementDictItem(mutation.target);
      if (native && native.parentNode) native.parentNode.removeChild(native);
      this._elementDictionary[mutation.target.uid] = undefined;
    }

    if (mutation.type === TreeNodeMutationTypes.NODE_ADDED) {
      const mutationTarget = <SyntheticDOMNode>mutation.target;
      const [native, synthetic] = this.getElementDictItem(mutationTarget.parent);
      if (native) {
        const childNode = renderHTMLNode(this.nodeFactory, mutation.target, this._elementDictionary);
        const index     = mutationTarget.parentNode.childNodes.indexOf(mutationTarget);
        if (index !== mutationTarget.parentNode.childNodes.length - 1) {
          const [prevChildNode] = this.getElementDictItem<Node>(mutationTarget.parentNode.childNodes[index - 1]);
          native.insertBefore(prevChildNode, childNode);
        } else {
          native.appendChild(childNode);
        }
        mutationTarget.attachNative(native);
      }
    }

    // CSS
    if (mutation.type === SyntheticCSSStyleRuleMutationTypes.SET_DECLARATION) {
      const { target, name, newValue, oldName } = <PropertyMutation<SyntheticCSSStyleRule>>mutation;
      const [nativeRule] = this.getCSSDictItem<CSSStyleRule>(target);
      if (nativeRule) {
        if (newValue == null) {
          nativeRule.style.removeProperty(name);
        } else {
          nativeRule.style[name] = newValue;
        }
        if (oldName) {
          nativeRule.style[name] = undefined;
        }
      }
    }

    if (mutation.type === CSSGroupingRuleMutationTypes.REMOVE_RULE_EDIT || mutation.type === CSSGroupingRuleMutationTypes.MOVE_RULE_EDIT) {
      const { target, child } = <RemoveChildMutation<SyntheticCSSStyleSheet, SyntheticCSSStyleRule>>mutation;
      this.removeNativeRule(child, target);
    }

    if (mutation.type === CSSGroupingRuleMutationTypes.INSERT_RULE_EDIT || mutation.type === CSSGroupingRuleMutationTypes.MOVE_RULE_EDIT) {
      const { target, child, index } = <InsertChildMutation<SyntheticCSSStyleSheet, SyntheticCSSStyleRule>>mutation;
      this.insertNativeRule(child, index, target);
    }

    if (mutation.type === SyntheticDocumentMutationTypes.REMOVE_DOCUMENT_STYLE_SHEET_EDIT || mutation.type === SyntheticDocumentMutationTypes.MOVE_DOCUMENT_STYLE_SHEET_EDIT) {
      const { target, child } = <RemoveChildMutation<SyntheticDocument, SyntheticCSSStyleSheet>>mutation;
      const actual = this.getSyntheticStyleSheet(child);

      if (actual)
      for (const syntheticRule of actual.rules) {
        this.removeNativeRule(syntheticRule);
      }
    }

    if (mutation.type === SyntheticDocumentMutationTypes.ADD_DOCUMENT_STYLE_SHEET_EDIT || mutation.type === SyntheticDocumentMutationTypes.MOVE_DOCUMENT_STYLE_SHEET_EDIT) {
      const { target, child, index } = <InsertChildMutation<SyntheticDocument, SyntheticCSSStyleSheet>>mutation;

      // check UID - may have been bubbled up
      if (target.uid === this.document.uid) {
        let cindex = this.getNativeRuleIndex(index);
        for (const syntheticRule of child.rules) {
          this.insertNativeRule(syntheticRule, cindex++);
        }
      }
    }
  }

  private removeNativeRule(child: SyntheticCSSObject, parent?: SyntheticCSSStyleSheet|SyntheticCSSAtRule) {
    const [nativeRule, syntheticRule] = this.getCSSDictItem(child);

    if (!nativeRule) return;

    if (parent instanceof SyntheticCSSAtRule) {
      const [groupingRule, syntheticAtRule] = this.getCSSDictItem<CSSGroupingRule>(parent);
      if (!groupingRule) return;
      groupingRule.deleteRule(Array.prototype.indexOf.call(groupingRule.cssRules, nativeRule));
    } else {
      if (parent && this.getSyntheticStyleSheetIndex(parent) === -1) return;
      const nativeStyleSheet = this.getNativeStyleSheet();
      nativeStyleSheet.removeRule(Array.prototype.indexOf.call(nativeStyleSheet.rules, nativeRule));
    }

    this._cssRuleDictionary[child.uid] = undefined;
  }

  private insertNativeRule(child: syntheticCSSRuleType, index: number, parent?: SyntheticCSSStyleSheet|SyntheticCSSAtRule) {

    if (parent && parent instanceof SyntheticCSSAtRule) {
      const [groupingRule, syntheticAtRule] = this.getCSSDictItem<CSSGroupingRule>(parent);
      if (!groupingRule) return;
      groupingRule.insertRule(child.cssText, index);
      this._cssRuleDictionary[child.uid] = [groupingRule.cssRules.item(index), child];
    } else {
      if (parent && this.getSyntheticStyleSheetIndex(parent) === -1) return;
      const nativeStyleSheet = this.getNativeStyleSheet();
      nativeStyleSheet.insertRule(child.cssText, index);
      this._cssRuleDictionary[child.uid] = [nativeStyleSheet.cssRules.item(index), child];
    }
  }

  private getSyntheticStyleSheetIndex(styleSheet: SyntheticCSSObject) {
    return this.document.styleSheets.findIndex(ss => ss.uid === styleSheet.uid);
  }

  private getSyntheticStyleSheet(styleSheet: SyntheticCSSObject) {
    return this.document.styleSheets[this.getSyntheticStyleSheetIndex(styleSheet)];
  }

  private getNativeRuleIndex(index: number) {
    this.document.styleSheets.slice(index + 1).forEach((ss) => {
      index += ss.rules.length;
    });
    return index;
  }

  protected getElementDictItem<T extends Node>(synthetic: SyntheticDOMNode): [T, SyntheticDOMNode] {
    return this._elementDictionary && this._elementDictionary[synthetic.uid] || [undefined, undefined] as any;
  }

  protected getElementInnerHTML() {
    return `<style type="text/css"></style><div></div>`;
  }

  protected render() {
    const { document, element } = this;

    if (!this._documentElement) {
      this._documentElement = renderHTMLNode(this.nodeFactory, document, this._elementDictionary = {});
      element.lastChild.appendChild(this._documentElement);
      this.styleElement.textContent = this._currentCSSText = document.styleSheets.map((styleSheet) => styleSheet.cssText).join("\n");
    }

    this.updateRects();
  }

  get styleElement() {
    return this.element.firstChild as HTMLStyleElement;
  }

  private getCSSDictItem<T extends CSSRule>(target: SyntheticCSSObject): [T, syntheticCSSRuleType] {
    this.registerStyleSheet();
    return (this._cssRuleDictionary && this._cssRuleDictionary[target.uid]) || [undefined, undefined] as any;
  }

  private getNativeStyleSheet(): CSSStyleSheet {
    return this._nativeStyleSheet || (this._nativeStyleSheet = Array.prototype.slice.call(this.styleElement.ownerDocument.styleSheets).find((styleSheet: CSSStyleSheet) => {
      return styleSheet.ownerNode === this.styleElement;
    }));
  }

  private registerStyleSheet() {
    if (this._cssRuleDictionary) return;

    const nativeStyleSheet = this.getNativeStyleSheet();

    if (!nativeStyleSheet) {
      // console.warn(`Cannot find native style sheet generated by DOM renderer.`);
      return;
    }
    this._cssRuleDictionary = {};

    let h = 0;

    for (let i = 0, n  = this.document.styleSheets.length; i < n; i++){
      const styleSheet = this.document.styleSheets[i];
      for (let j = 0, n2 = styleSheet.rules.length; j < n2; j++) {
        const rule = styleSheet.rules[j];

        // TODO - need to remove charset from synthetic object
        this._cssRuleDictionary[rule.uid] = [nativeStyleSheet.rules[h++], rule];
      }
    }
  }

  protected reset() {
    this._documentElement = undefined;
    this._nativeStyleSheet = undefined;
    if (this.element) this.element.innerHTML = this.getElementInnerHTML();
  }

  private updateRects() {
    const syntheticDOMNodesByUID = {};
    const rects  = {};
    const styles = {};

    for (let uid in this._elementDictionary) {
      const [native, synthetic] = this._elementDictionary[uid] || [undefined, undefined];

      // (<HTMLElement>native).

      const syntheticNode: SyntheticDOMNode = <SyntheticDOMNode>synthetic;
      if (syntheticNode && syntheticNode.nodeType === DOMNodeType.ELEMENT) {
        const rect = rects[uid]  = BoundingRect.fromClientRect((<Element>native).getBoundingClientRect());

        const nativeStyle = this._getComputedStyle(native);

        // just attach whatever's returned by the DOM -- don't wrap this in a synthetic, or else
        // there'll be massive performance penalties.
        styles[uid] = nativeStyle;
        (<SyntheticDOMNode>syntheticNode).attachNative(native);
      }
    }

    this.setRects(rects, styles);
  }
}

function renderHTMLNode(nodeFactory: Document, syntheticNode: SyntheticDOMNode, dict: HTMLElementDictionaryType): any {
  switch(syntheticNode.nodeType) {

    case DOMNodeType.TEXT:
      const textNode = nodeFactory.createTextNode(decode(syntheticNode.textContent));
      dict[syntheticNode.uid] = [textNode, syntheticNode];
      return textNode;

    case DOMNodeType.COMMENT:
      const comment = nodeFactory.createComment((<SyntheticDOMComment>syntheticNode).nodeValue);
      return comment;

    case DOMNodeType.ELEMENT:
      const syntheticElement = <SyntheticDOMElement>syntheticNode;
      if (/^(style|link)$/.test(syntheticElement.nodeName)) return null;
      const element = renderHTMLElement(nodeFactory, syntheticElement.tagName, syntheticElement, dict);
      for (let i = 0, n = syntheticElement.attributes.length; i < n; i++) {
        const syntheticAttribute = syntheticElement.attributes[i];
        element.setAttribute(syntheticAttribute.name, syntheticAttribute.value);
      }
      return appendChildNodes(nodeFactory, element, syntheticElement.childNodes, dict);
    case DOMNodeType.DOCUMENT:
    case DOMNodeType.DOCUMENT_FRAGMENT:
      const syntheticContainer = <SyntheticDOMContainer>syntheticNode;
      const containerElement = renderHTMLElement(nodeFactory, "span", syntheticContainer, dict);
      return appendChildNodes(nodeFactory, containerElement, syntheticContainer.childNodes, dict);
  }
}

function renderHTMLElement(nodeFactory: Document, tagName: string, source: SyntheticDOMNode, dict: HTMLElementDictionaryType): any {
  const element = nodeFactory.createElementNS(source.namespaceURI === SVG_XMLNS ? SVG_XMLNS : HTML_XMLNS, tagName);
  dict[source.uid] = [element, source];
  return element;
}

function appendChildNodes(nodeFactory: Document, container: HTMLElement|DocumentFragment, syntheticChildNodes: SyntheticDOMNode[], dict: HTMLElementDictionaryType) {
  for (let i = 0, n = syntheticChildNodes.length; i < n; i++) {
    const childNode = renderHTMLNode(nodeFactory, syntheticChildNodes[i], dict);

    // ignored
    if (childNode == null) continue;
    container.appendChild(childNode);
  }
  return container;
}