import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

/** صفحة 404 عربية مع رابط للرئيسية */
export default function NotFound() {
  return (
    <div
      dir="rtl"
      lang="ar"
      className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4"
    >
      <Card className="w-full max-w-md rounded-sm shadow-sm border-slate-200 dark:border-slate-800">
        <CardContent className="pt-8 pb-8 text-center">
          <AlertCircle className="h-12 w-12 text-zinc-500 mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-2">
            الصفحة غير موجودة
          </h1>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            عذراً، الصفحة التي تبحث عنها غير متوفرة أو تم نقلها.
          </p>
          <Link href="/">
            <span
              className="inline-flex items-center justify-center h-10 px-6 rounded-sm bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-bold transition-colors cursor-pointer"
              data-testid="link-404-home"
            >
              العودة للرئيسية
            </span>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
