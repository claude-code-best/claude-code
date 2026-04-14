/// <reference lib="dom" />

declare module "@xmldom/xmldom" {
  var DOMParser: DOMParserStatic;
  var XMLSerializer: XMLSerializerStatic;
  var DOMImplementation: DOMImplementationStatic;

  interface DOMImplementationStatic {
      new(): DOMImplementation;
  }

  interface DOMParserStatic {
      new (): DOMParser;
      new (options: Options): DOMParser;
  }

  interface XMLSerializerStatic {
      new (): XMLSerializer;
  }

  interface DOMParser {
      parseFromString(xmlsource: string, mimeType?: string): Document;
  }

  interface XMLSerializer {
      /**
       * Returns the result of serializing `node` to XML.
       *
       * __This implementation differs from the specification:__
       * - CDATASection nodes whose data contains `]]>` are serialized by splitting the section
       *   at each `]]>` occurrence (following W3C DOM Level 3 Core `split-cdata-sections`
       *   default behaviour). A configurable option is not yet implemented.
       *
       * @see https://html.spec.whatwg.org/#dom-xmlserializer-serializetostring
       */
      serializeToString(node: Node): string;
  }

  interface Options {
      locator?: any;
      errorHandler?: ErrorHandlerFunction | ErrorHandlerObject | undefined;
  }

  interface ErrorHandlerFunction {
      (level: string, msg: any): any;
  }

  interface ErrorHandlerObject {
      warning?: ((msg: any) => any) | undefined;
      error?: ((msg: any) => any) | undefined;
      fatalError?: ((msg: any) => any) | undefined;
  }
}
