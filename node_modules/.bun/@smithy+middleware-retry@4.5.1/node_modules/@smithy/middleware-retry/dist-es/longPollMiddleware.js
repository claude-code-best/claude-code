export const longPollMiddleware = () => (next, context) => async (args) => {
    context.__retryLongPoll = true;
    return next(args);
};
export const longPollMiddlewareOptions = {
    name: "longPollMiddleware",
    tags: ["RETRY"],
    step: "initialize",
    override: true,
};
export const getLongPollPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.add(longPollMiddleware(), longPollMiddlewareOptions);
    },
});
