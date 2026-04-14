"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSmithyContext = void 0;
const types_1 = require("@smithy/types");
const getSmithyContext = (context) => context[types_1.SMITHY_CONTEXT_KEY] || (context[types_1.SMITHY_CONTEXT_KEY] = {});
exports.getSmithyContext = getSmithyContext;
