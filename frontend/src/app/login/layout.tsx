export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <main className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}