"use client"

import { motion } from "motion/react"
import { WordReveal } from "@/components/notebook/reveal"
import { SPRING_LAYOUT, SPRING_PANEL, SPRING_PRESS } from "@/lib/ease"

export function LoginShowcase() {
  return (
    <div className="mx-auto w-full max-w-md">
      <motion.div
        initial={{ opacity: 0, y: 12, x: 16 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ ...SPRING_PANEL, delay: 0.3 }}
        className="ml-auto w-fit rounded-2xl bg-white/80 px-4 py-2 text-sm shadow-sm backdrop-blur"
      >
        Wie lange leben Arbeiterinnen?
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...SPRING_PANEL, delay: 0.75 }}
        className="mt-4 rounded-2xl bg-white/90 p-5 text-[15px] leading-relaxed shadow-xl shadow-black/5 backdrop-blur"
      >
        <WordReveal text="Im Sommer nur etwa sechs Wochen" delay={0.9} />
        <motion.sup
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...SPRING_PRESS, delay: 1.45 }}
          className="mr-1 inline-block rounded-full bg-neutral-900 px-1.5 py-0.5 font-mono text-[9px] text-white"
        >
          1
        </motion.sup>
        <WordReveal text="als Winterbienen dagegen bis zu sechs Monate." delay={1.3} />
        <motion.div
          initial={{ opacity: 0, height: 0, marginTop: 0 }}
          animate={{ opacity: 1, height: "auto", marginTop: 16 }}
          transition={{ ...SPRING_LAYOUT, delay: 1.9 }}
          className="overflow-hidden"
        >
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-[13px] text-neutral-600">
            <p className="font-mono text-[10px] tracking-widest text-neutral-400 uppercase">Quelle 1 · Die Honigbiene.pdf</p>
            <p className="mt-1.5">
              <span className="marker [--marker:oklch(0.93_0.135_98)]" style={{ animationDelay: "2.35s" }}>
                Arbeiterinnen leben im Sommer etwa sechs Wochen
              </span>
              , Winterbienen bis zu sechs Monate.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
