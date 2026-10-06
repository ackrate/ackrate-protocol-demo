import type { Application } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Keep the Vercel invocation alive until Express has completed the response. */
export function serveExpressRequest(app: Application, request: IncomingMessage, response: ServerResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      response.off("finish", done);
      response.off("close", done);
      response.off("error", failed);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = (error: Error) => { cleanup(); reject(error); };
    response.once("finish", done);
    response.once("close", done);
    response.once("error", failed);
    try { app(request, response); } catch (error) { cleanup(); reject(error); }
  });
}
