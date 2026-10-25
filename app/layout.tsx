import { Geist_Mono, Inter, Instrument_Serif } from "next/font/google"
import type { Metadata } from "next"

import "./globals.css"
import { MotionProvider } from "@/components/motion-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: { default: "Folio", template: "%s · Folio" },
  description: "Lade deine Quellen hoch und sprich mit ihnen. Jede Antwort belegt.",
}

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" })
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="de"
      suppressHydrationWarning
      className={cn("font-sans antialiased", inter.variable, serif.variable, mono.variable)}
    >
      <body>
        <ThemeProvider>
          <MotionProvider>
            <Toaster>{children}</Toaster>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
