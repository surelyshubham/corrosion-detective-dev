import { Sigma } from "lucide-react"

export function Header() {
  return (
    <header className="flex items-center justify-between gap-4 px-6 py-4 border-b bg-card">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-lg bg-primary text-primary-foreground">
          <Sigma className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tighter font-headline text-foreground">
          Sigma Corrosion Detective
        </h1>
        <span className="text-xs font-mono text-muted-foreground mt-1">V1</span>
      </div>
    </header>
  )
}
