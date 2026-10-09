import { Suspense, ViewTransition, type ReactNode } from "react";

const DIRECTIONAL = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" } as const;

/**
 * Page body that slides with navigation direction (links tag themselves nav-forward /
 * nav-back), and whose skeleton hands off to real content with a short reveal.
 * Wrap per page, not in a layout: layouts persist so they never enter or exit.
 */
export function PageMotion({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <ViewTransition enter={DIRECTIONAL} exit={DIRECTIONAL} default="none">
      <div>
        <Suspense
          fallback={
            <ViewTransition exit="reveal-exit" default="none">
              <div>{fallback}</div>
            </ViewTransition>
          }
        >
          <ViewTransition enter="reveal-enter" default="none">
            <div>{children}</div>
          </ViewTransition>
        </Suspense>
      </div>
    </ViewTransition>
  );
}
