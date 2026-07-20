import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FileScan, Upload, Sparkles, TrendingDown, History } from "lucide-react";
import {
  useAnalyzeInvoice,
  useGetMyInvoiceAnalyses,
  getGetMyInvoiceAnalysesQueryKey,
  type InvoiceAnalysis,
} from "@workspace/api-client-react";
import { apiErrorMessage } from "@/lib/orders";

type ComparisonRow = {
  item?: string;
  invoice_price?: string;
  platform_price?: string;
  platform_supplier?: string;
  note?: string;
};

const parseRows = (raw?: string): ComparisonRow[] => {
  try { return JSON.parse(raw ?? "[]"); } catch { return []; }
};

/** رفع فاتورة سابقة ليحللها الذكاء الاصطناعي ويقارنها بأسعار موردي المنصة. */
export function InvoiceAnalyzerCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<InvoiceAnalysis | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: history } = useGetMyInvoiceAnalyses({
    query: { queryKey: getGetMyInvoiceAnalysesQueryKey() },
  });

  const analyze = useAnalyzeInvoice({
    mutation: {
      onSuccess: (data) => {
        setResult(data);
        queryClient.invalidateQueries({ queryKey: getGetMyInvoiceAnalysesQueryKey() });
        toast({ title: "اكتمل تحليل الفاتورة" });
      },
      onError: (err) => toast({ title: apiErrorMessage(err, "تعذر تحليل الفاتورة"), variant: "destructive" }),
    },
  });

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "حجم الملف كبير — الحد الأقصى ١٠ ميجابايت", variant: "destructive" });
      return;
    }
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      toast({ title: "ارفع صورة الفاتورة بصيغة JPG أو PNG", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const base64 = dataUrl.split(",")[1] ?? "";
      analyze.mutate({ data: { file_base64: base64, mime_type: file.type, file_name: file.name } });
    };
    reader.readAsDataURL(file);
  };

  const shown = result ?? (showHistory ? null : history?.[0] ?? null);
  const rows = parseRows(shown?.comparison);
  const saving = Number(shown?.potential_saving ?? "");

  return (
    <Card className="rounded-sm border-slate-200 shadow-sm" data-testid="card-invoice-analyzer">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 py-4">
        <CardTitle className="text-base flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
          <FileScan className="h-4 w-4 text-blue-600" />
          مقارنة فواتيرك السابقة · Invoice Comparison
        </CardTitle>
        <p className="text-xs text-slate-400 font-medium pt-1">
          ارفع صورة فاتورة من موردك الحالي، وسيقارنها الذكاء الاصطناعي بأسعار موردي المنصة ويحسب لك الوفر
        </p>
      </CardHeader>
      <CardContent className="p-4 bg-white dark:bg-slate-950 space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
          data-testid="input-invoice-file"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={analyze.isPending}
            className="rounded-sm bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
            data-testid="button-upload-invoice"
          >
            {analyze.isPending ? (
              <><Sparkles className="h-4 w-4 ml-1 animate-pulse" /> جارٍ التحليل بالذكاء الاصطناعي...</>
            ) : (
              <><Upload className="h-4 w-4 ml-1" /> رفع صورة فاتورة</>
            )}
          </Button>
          {!!history?.length && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm font-bold text-xs"
              onClick={() => setShowHistory((v) => !v)}
              data-testid="button-toggle-history"
            >
              <History className="h-3.5 w-3.5 ml-1" /> التحليلات السابقة ({history.length})
            </Button>
          )}
        </div>

        {showHistory && !!history?.length && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-sm">
            {history.map((h) => (
              <button
                key={h.id}
                className="w-full text-right px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors flex items-center gap-3"
                onClick={() => { setResult(h); setShowHistory(false); }}
                data-testid={`row-analysis-${h.id}`}
              >
                <FileScan className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-1 truncate">
                  {h.file_name || `تحليل #${h.id}`}
                </span>
                <span className="text-[10px] text-slate-400">{new Date(h.created_at).toLocaleDateString("ar-SA")}</span>
              </button>
            ))}
          </div>
        )}

        {shown && (
          <div className="space-y-3" data-testid="panel-analysis-result">
            {shown.summary && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-sm p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-extrabold text-blue-800 dark:text-blue-300">خلاصة الذكاء الاصطناعي</span>
                </div>
                <p className="text-sm text-blue-900/80 dark:text-blue-200/80 leading-relaxed">{shown.summary}</p>
              </div>
            )}

            {Number.isFinite(saving) && saving > 0 && (
              <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900 rounded-sm p-3.5">
                <TrendingDown className="h-5 w-5 text-emerald-600" />
                <div>
                  <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400">
                    وفر محتمل: {saving.toLocaleString("ar-SA")} ر.س
                  </div>
                  <div className="text-[11px] text-emerald-600/70">مقارنة بأقل أسعار موردي المنصة للأصناف المطابقة</div>
                </div>
              </div>
            )}

            {!!rows.length && (
              <div className="border border-slate-100 dark:border-slate-800 rounded-sm overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
                    <tr>
                      <th className="text-right font-bold p-2.5">الصنف</th>
                      <th className="text-right font-bold p-2.5">سعر فاتورتك</th>
                      <th className="text-right font-bold p-2.5">سعر المنصة</th>
                      <th className="text-right font-bold p-2.5">المورد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="p-2.5 font-bold text-slate-700 dark:text-slate-200">{r.item || "—"}</td>
                        <td className="p-2.5 text-slate-600 dark:text-slate-300">{r.invoice_price || "—"}</td>
                        <td className="p-2.5 font-bold text-blue-700 dark:text-blue-400">{r.platform_price || "غير متوفر"}</td>
                        <td className="p-2.5 text-slate-500">{r.platform_supplier || (r.note ? <span className="text-slate-400">{r.note}</span> : "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
