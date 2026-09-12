import "./globals.css";

export const metadata = {
  title: "Employee Work Management",
  description: "Plan, assign, schedule, and track work across your team.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
