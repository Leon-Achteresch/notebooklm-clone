"use client"

import { motion, type Variants } from "motion/react"
import { SPRING_LAYOUT } from "@/lib/ease"
import { cn } from "@/lib/utils"

export function WordReveal({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <motion.span
      className={cn("inline", className)}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.055, delayChildren: delay } } }}
      aria-label={text}
    >
      {text.split(" ").map((word, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.12em] align-top">
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: "105%", filter: "blur(6px)" },
              show: { y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 140, damping: 20, mass: 0.7 } },
            }}
          >
            {word}
            {" "}
          </motion.span>
        </span>
      ))}
    </motion.span>
  )
}

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: SPRING_LAYOUT },
}

export function Stagger({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  )
}

export function Lift({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} whileHover={{ y: -6 }} whileTap={{ scale: 0.985 }} transition={SPRING_LAYOUT}>
      {children}
    </motion.div>
  )
}
