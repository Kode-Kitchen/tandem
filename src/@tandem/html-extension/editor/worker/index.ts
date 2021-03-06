// note unused imports - fixes --declaration issue with typescript

import { MimeTypeProvider, HTML_MIME_TYPE } from "@tandem/common";
import {
  ContentEditorFactoryProvider,
  DependencyLoaderFactoryProvider,
  SandboxModuleEvaluatorFactoryProvider,
} from "@tandem/sandbox";

import { SyntheticDOMElementClassProvider, ElementTextContentMimeTypeProvider } from "@tandem/synthetic-browser";
import { SelfPreviewLoader, PreviewLoaderProvider } from "@tandem/editor/worker/providers";

export const createHTMLEditorWorkerProviders = () => {
  return [
    new PreviewLoaderProvider("htmlPreview", (uri, kernel) => {
      return MimeTypeProvider.lookup(uri, kernel) === HTML_MIME_TYPE;
    }, SelfPreviewLoader)
  ];
}

export * from "../../core";