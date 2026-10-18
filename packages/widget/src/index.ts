import { defineRoofQuote } from "./element";

export { defineRoofQuote, RoofQuoteElement } from "./element";
export { RoofQuote } from "./RoofQuote";
export type { RoofQuoteProps, RoofQuoteLeadEvent, RoofQuoteQuoteEvent } from "./RoofQuote";
export * from "./config";

// Importing the package registers <roof-quote>.
defineRoofQuote();
