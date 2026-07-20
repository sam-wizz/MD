import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Card className="w-full max-w-md mx-4 rounded-sm shadow-sm border-slate-200">
        <CardContent className="pt-8 pb-8 text-center">
          <AlertCircle className="h-12 w-12 text-blue-500 mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-1">
            الصفحة غير موجودة
          </h1>
          <p className="text-xs text-blue-500 font-semibold uppercase tracking-widest mb-4">404 Page Not Found</p>
          <p className="text-sm text-slate-500 mb-6">
            عذراً، الصفحة التي تبحث عنها غير متوفرة.
            <br />
            <span className="text-slate-400 text-xs">Sorry, the page you are looking for does not exist.</span>
          </p>
          <Link href="/">
            <span className="inline-flex items-center justify-center h-10 px-6 rounded-sm bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors cursor-pointer">
              العودة للرئيسية · Go Home
            </span>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
