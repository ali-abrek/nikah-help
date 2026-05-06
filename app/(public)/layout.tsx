export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-full flex items-center justify-center px-4">
      {children}
    </main>
  )
}
