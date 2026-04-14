// const { Expression } = require('path-expression-matcher');

type Matcher = unknown;
type Expression = unknown;

type XmlBuilderOptions = {
  /**
   * Give a prefix to the attribute name in the resulting JS object
   * 
   * Defaults to '@_'
   */
  attributeNamePrefix?: string;

  /**
   * A name to group all attributes of a tag under, or `false` to disable
   * 
   * Defaults to `false`
   */
  attributesGroupName?: false | string;

  /**
   * The name of the next node in the resulting JS
   * 
   * Defaults to `#text`
   */
  textNodeName?: string;

  /**
   * Whether to ignore attributes when building
   * 
   * When `true` - ignores all the attributes
   * 
   * When `false` - builds all the attributes
   * 
   * When `Array<string | RegExp>` - filters out attributes that match provided patterns
   * 
   * When `Function` - calls the function for each attribute and filters out those for which the function returned `true`
   * 
   * Defaults to `true`
   */
  ignoreAttributes?: boolean | (string | RegExp)[] | ((attrName: string, jPath: string) => boolean);

  /**
   * Give a property name to set CDATA values to instead of merging to tag's text value
   * 
   * Defaults to `false`
   */
  cdataPropName?: false | string;

  /**
   * If set, parse comments and set as this property
   * 
   * Defaults to `false`
   */
  commentPropName?: false | string;

  /**
   * Whether to make output pretty instead of single line
   * 
   * Defaults to `false`
   */
  format?: boolean;


  /**
   * If `format` is set to `true`, sets the indent string
   * 
   * Defaults to `  `
   */
  indentBy?: string;

  /**
   * Give a name to a top-level array
   * 
   * Defaults to `undefined`
   */
  arrayNodeName?: string;

  /**
   * Create empty tags for tags with no text value
   * 
   * Defaults to `false`
   */
  suppressEmptyNode?: boolean;

  /**
   * Suppress an unpaired tag
   * 
   * Defaults to `true`
   */
  suppressUnpairedNode?: boolean;

  /**
   * Don't put a value for boolean attributes
   * 
   * Defaults to `true`
   */
  suppressBooleanAttributes?: boolean;

  /**
   * Preserve the order of tags in resulting JS object
   * 
   * Defaults to `false`
   */
  preserveOrder?: boolean;

  /**
   * List of tags without closing tags
   * 
   * Defaults to `[]`
   */
  unpairedTags?: string[];

  /**
   * Nodes to stop parsing at
   * 
   * Accepts string patterns or Expression objects from path-expression-matcher
   * 
   * String patterns starting with "*." are automatically converted to ".." for backward compatibility
   * 
   * Defaults to `[]`
   */
  stopNodes?: (string | Expression)[];

  /**
   * Control how tag value should be parsed. Called only if tag value is not empty
   * 
   * @returns {undefined|null} `undefined` or `null` to set original value.
   * @returns {unknown} 
   * 
   * 1. Different value or value with different data type to set new value.
   * 2. Same value to set parsed value if `parseTagValue: true`.
   * 
   * Defaults to `(tagName, val, jPath, hasAttributes, isLeafNode) => val`
   */
  tagValueProcessor?: (name: string, value: unknown) => unknown;

  /**
   * Control how attribute value should be parsed
   * 
   * @param attrName 
   * @param attrValue 
   * @param jPath 
   * @returns {undefined|null} `undefined` or `null` to set original value
   * @returns {unknown}
   * 
   * Defaults to `(attrName, val, jPath) => val`
   */
  attributeValueProcessor?: (name: string, value: unknown) => unknown;

  /**
   * Whether to process default and DOCTYPE entities
   * 
   * Defaults to `true`
   */
  processEntities?: boolean;


  oneListGroup?: boolean;

  /**
   * Maximum number of nested tags
   * 
   * Defaults to `100`
   */
  maxNestedTags?: number;
};

interface XMLBuilder {
  build(jObj: any): string;
}

interface XMLBuilderConstructor {
  new(options?: XmlBuilderOptions): XMLBuilder;
  (options?: XmlBuilderOptions): XMLBuilder;
}

declare const Builder: XMLBuilderConstructor;

export = Builder;