import { useEffect, useRef, useState } from "react";

/**
 * useAnimatedCounter — anima um número do valor anterior até o alvo usando rAF.
 *
 * Características:
 *  • Easing: easeOutCubic — rápido no começo, suave no final (sensação "premium")
 *  • Respeita `prefers-reduced-motion` — retorna o valor direto se o usuário
 *    preferir movimento reduzido (acessibilidade)
 *  • Anima a partir do valor atual (não sempre de 0) — evita flash feio quando
 *    os dados mudam em resposta a filtros
 *  • Fallback seguro em SSR (sem window)
 */
export function useAnimatedCounter(target: number, durationMs: number = 800): number {
  const [display, setDisplay] = useState<number>(target);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef<number>(target);

  useEffect(() => {
    // SSR / prefers-reduced-motion → pula animação
    if (typeof window === "undefined") {
      setDisplay(target);
      return;
    }

    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setDisplay(target);
      return;
    }

    // Nada pra animar
    if (fromRef.current === target) {
      setDisplay(target);
      return;
    }

    const from = fromRef.current;
    const delta = target - from;
    const startTs = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTs;
      const t = Math.min(1, elapsed / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + delta * eased;
      setDisplay(current);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // Commit valor final mesmo em cleanup pra evitar estado intermediário
      fromRef.current = target;
    };
  }, [target, durationMs]);

  // Arredonda pra inteiro pra não mostrar "1234.7234"
  return Math.round(display);
}
