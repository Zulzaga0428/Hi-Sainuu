import { Globe } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Globe className="w-8 h-8 text-primary opacity-70" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Хуудас олдсонгүй. / Page not found.
        </p>
        <a
          href="/"
          className="inline-block mt-6 bg-primary text-white font-semibold text-sm px-5 py-3 rounded-xl active:scale-95 transition-transform"
        >
          Нүүр хуудас руу / Go home
        </a>
      </div>
    </div>
  );
}
