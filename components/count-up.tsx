"use client";

import { useEffect, useRef, useState } from "react";
import type { Currency } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";
import { cx } from "./ui";

/**
 * A money amount that counts to its value when it first appears or changes, so a new
 * balance reads as a change rather than a swap. Static for reduced-motion users.
 */
export function CountUp({
  minor,
  currency,
  signed,
  className,
}: {
  minor: number;
  currency: Currency;
  signed?: boolean;
  className?: string;
}) {
  const target = signed ? Math.abs(minor) : minor;
  const [shown, setShown] = useState(target);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    const duration = 500;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(origin + (target - origin) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const tone = !signed || minor === 0 ? "" : minor > 0 ? "text-owed" : "text-owe";
  return (
    <span className={cx("tabular-nums", tone, className)}>
      {/* Screen readers get the final value, not every frame. */}
      <span aria-hidden>{formatMoney(shown, currency)}</span>
      <span className="sr-only">{formatMoney(target, currency)}</span>
    </span>
  );
}
