import { Readable } from "stream";
export class MockEventMessageSource extends Readable {
    constructor(options) {
        super(options);
        this.readCount = 0;
        this.data = Buffer.concat(options.messages);
        this.emitSize = options.emitSize;
        this.throwError = options.throwError;
    }
    _read() {
        const self = this;
        if (this.readCount === this.data.length) {
            if (this.throwError) {
                process.nextTick(function () {
                    self.emit("error", new Error("Throwing an error!"));
                });
                return;
            }
            else {
                this.push(null);
                return;
            }
        }
        const bytesLeft = this.data.length - this.readCount;
        const numBytesToSend = Math.min(bytesLeft, this.emitSize);
        const chunk = this.data.slice(this.readCount, this.readCount + numBytesToSend);
        this.readCount += numBytesToSend;
        this.push(chunk);
    }
}
