export function Footer() {
  return (
    <footer className="border-t border-border px-5 py-8 md:px-10 md:py-12">
      <p className="text-xs text-text-muted">
        &copy; {new Date().getFullYear()} Kevin Lee
      </p>
    </footer>
  );
}
