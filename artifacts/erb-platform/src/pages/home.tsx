import { useEffect, useRef, useState, ReactNode } from "react";
import { MainNav } from "@/components/layout/main-nav";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Building2, 
  ChevronLeft, 
  PackageCheck, 
  ArrowLeftRight, 
  CheckCircle2,
  Activity
} from "lucide-react";
import heroWarehouse from "@assets/generated_images/hero-warehouse-v2.jpg";
import networkNodes from "@assets/generated_images/network-nodes-v2.jpg";
import logisticsFleet from "@assets/generated_images/logistics-fleet-v2.jpg";

function Reveal({ children, delay = 0, className = "", direction = "up" }: { children: ReactNode, delay?: number, className?: string, direction?: "up" | "fade" | "scale" }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const getInitialStyle = () => {
    switch (direction) {
      case "up": return { opacity: 0, transform: "translateY(40px)" };
      case "scale": return { opacity: 0, transform: "scale(0.95)" };
      case "fade": return { opacity: 0, transform: "none" };
      default: return { opacity: 0, transform: "translateY(40px)" };
    }
  };

  const getFinalStyle = () => {
    switch (direction) {
      case "up": return { opacity: 1, transform: "translateY(0)" };
      case "scale": return { opacity: 1, transform: "scale(1)" };
      case "fade": return { opacity: 1, transform: "none" };
      default: return { opacity: 1, transform: "translateY(0)" };
    }
  };

  const initial = getInitialStyle();
  const final = getFinalStyle();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? final.opacity : initial.opacity,
        transform: isVisible ? final.transform : initial.transform,
        transition: `opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-50 selection:bg-blue-600/30 selection:text-white">
      <MainNav />
      <main className="flex-1">

        {/* Hero Section */}
        <section className="relative min-h-[95vh] flex items-center pt-20 pb-32 overflow-hidden border-b border-white/5">
          <div className="absolute inset-0 z-0 bg-slate-950">
            <img 
              src={heroWarehouse} 
              alt="Premium Logistics Warehouse" 
              className="w-full h-full object-cover opacity-20 mix-blend-luminosity scale-105 transform origin-center animate-in fade-in zoom-in duration-1000"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/20" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-l from-slate-950/80 via-transparent to-transparent" />
            
            {/* Technical grid mask */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,#000_60%,transparent_100%)] opacity-50" />
          </div>
          
          <div className="container mx-auto px-4 relative z-10 flex flex-col items-start justify-center h-full">
            <Reveal>
              <div className="inline-flex items-center gap-3 bg-blue-900/20 border border-blue-500/20 rounded-full px-4 py-1.5 mb-10 backdrop-blur-md shadow-[0_0_20px_rgba(37,99,235,0.15)]">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.8)] animate-pulse"></span>
                <span className="font-display text-blue-300 text-[10px] font-bold tracking-[0.25em] uppercase mt-0.5">National Supply Grid · KSA</span>
              </div>
            </Reveal>
            
            <div className="max-w-4xl relative">
              <Reveal delay={150}>
                <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold uppercase tracking-tight leading-[0.95] mb-6 text-white drop-shadow-2xl">
                  Supplying Your Business{" "}<br className="hidden sm:block" />
                  <span className="text-white">With Everything It Needs</span>
                </h1>
              </Reveal>
              
              <Reveal delay={300}>
                <div className="w-12 h-[2px] bg-blue-600 mb-6 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.5)]" />
                <h2 className="text-2xl md:text-3xl lg:text-4xl font-black tracking-tight text-slate-100 mb-8 leading-snug drop-shadow-lg">
                  لتزويد منشأتك بكل احتياجاتها
                </h2>
              </Reveal>
              
              <Reveal delay={450}>
                <p className="text-lg md:text-xl text-slate-400 mb-12 max-w-2xl leading-relaxed font-medium border-r-2 border-white/10 pr-6">
                  نربط الموردين المعتمدين بأصحاب المطاعم والكافيهات ومتاجر التجزئة في المملكة، عبر منصة رقمية موحدة تجمع طرفي سلسلة الإمداد وتضمن استمرار أعمالك دون توقف.
                </p>
              </Reveal>
              
              <Reveal delay={600}>
                <Button 
                  size="lg" 
                  variant="outline" 
                  onClick={() => document.getElementById('mechanics')?.scrollIntoView({ behavior: 'smooth' })}
                  className="h-14 px-8 text-lg font-bold border-white/20 bg-white/5 hover:bg-white/10 text-white rounded-sm transition-all duration-300 backdrop-blur-md group flex items-center gap-3"
                >
                  اكتشف المنظومة
                  <ChevronLeft className="h-5 w-5 text-blue-400 group-hover:-translate-x-1 transition-transform" />
                </Button>
              </Reveal>
            </div>
          </div>
          
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-50">
            <span className="font-display text-[9px] uppercase tracking-[0.3em] text-slate-400">Scroll</span>
            <div className="w-[1px] h-12 bg-gradient-to-b from-white/30 to-transparent" />
          </div>
        </section>

        {/* Scale Metrics */}
        <div className="relative z-20 -mt-16 container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 p-1 bg-white/5 backdrop-blur-2xl rounded-sm border border-white/10 shadow-2xl">
            {[
              { value: "+٢٥٠٠", label: "منشأة نشطة", en: "Active Businesses" },
              { value: "١٣", label: "منطقة في المملكة", en: "Regions Covered" },
              { value: "٢٤/٧", label: "متابعة رقمية", en: "Digital Monitoring" },
              { value: "+٥٠", label: "مورد معتمد", en: "Verified Suppliers" }
            ].map((stat, i) => (
              <Reveal key={i} delay={300 + (i * 100)} direction="scale">
                <div className="bg-slate-950/80 p-8 text-center flex flex-col justify-center items-center h-full hover:bg-slate-900 transition-colors border border-transparent hover:border-white/5 group">
                  <div className="text-4xl md:text-5xl font-black text-white mb-3 tracking-tighter drop-shadow-md group-hover:scale-110 group-hover:text-blue-400 transition-all duration-500">{stat.value}</div>
                  <div className="text-sm font-bold text-slate-300 mb-2">{stat.label}</div>
                  <div className="font-display text-[9px] font-bold tracking-[0.2em] text-blue-500/70 uppercase">{stat.en}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Operation Mechanics */}
        <section id="mechanics" className="pt-40 pb-32 relative bg-slate-950 overflow-hidden">
          {/* Background ambient light */}
          <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
          
          <div className="container mx-auto px-4">
            <Reveal>
              <div className="flex flex-col md:flex-row justify-between items-end mb-20 gap-8">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 mb-4">
                    <div className="w-8 h-[2px] bg-blue-500"></div>
                    <h2 className="font-display text-blue-400 text-[10px] font-bold tracking-[0.25em] uppercase mt-0.5">Operation Mechanics</h2>
                  </div>
                  <h3 className="text-3xl md:text-5xl font-black text-white mb-6 tracking-tight">آلية العمل والتشغيل</h3>
                  <p className="text-lg text-slate-400 leading-relaxed font-medium">
                    من مستودعات الموردين إلى منشأتك، نربط طرفي سلسلة الإمداد رقمياً لضمان الجودة، السرعة، والموثوقية في كل طلبية.
                  </p>
                </div>
                <div className="hidden md:block">
                  {/* Decorative tech element */}
                  <div className="w-24 h-24 border border-white/5 rounded-full flex items-center justify-center relative shadow-[0_0_30px_rgba(37,99,235,0.05)]">
                    <div className="absolute inset-2 border border-blue-500/20 rounded-full animate-[spin_10s_linear_infinite]" />
                    <Activity className="text-blue-500/40 w-8 h-8" />
                  </div>
                </div>
              </div>
            </Reveal>

            <div className="grid md:grid-cols-3 gap-6 relative max-w-6xl mx-auto">
              {/* Connector line for desktop */}
              <div className="hidden md:block absolute top-[5rem] left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent z-0" />

              {[
                {
                  step: "01",
                  title: "اعتماد الموردين",
                  en: "Supplier Verification",
                  icon: PackageCheck,
                  desc: "ندقق سجلات الموردين التجارية ومعايير جودة منتجاتهم قبل اعتمادهم، فلا يظهر في شبكة مَـد إلا مورد موثوق يستحق ثقة منشأتك.",
                  tags: ["تدقيق تجاري", "فحص الجودة", "اعتماد موثوق"]
                },
                {
                  step: "02",
                  title: "المطابقة الذكية",
                  en: "Smart Matching",
                  icon: ArrowLeftRight,
                  desc: "تسجّل منشأتك احتياجاتها عبر منصة مَـد، فتطابق المنصة طلبك مع المورد الأنسب حسب المنتج والمنطقة والسعر — فورياً وبشفافية.",
                  tags: ["طلب فوري", "مطابقة ذكية", "عروض تنافسية"]
                },
                {
                  step: "03",
                  title: "الربط والمتابعة",
                  en: "Connect & Track",
                  icon: Activity,
                  desc: "نربطك بالمورد مباشرة لإتمام التوريد، وتتابع عبر المنصة حالة طلبك ومراقبة منتجاتك أولاً بأول حتى استلامها في منشأتك.",
                  tags: ["تواصل مباشر", "تتبع الطلبات", "مراقبة المنتجات"]
                }
              ].map((phase, i) => (
                <Reveal key={i} delay={i * 150} direction="up">
                  <div className="relative z-10 bg-slate-900/40 backdrop-blur-md border border-white/10 p-10 rounded-sm hover:border-blue-500/40 hover:bg-slate-900/80 transition-all duration-500 group flex flex-col h-full overflow-hidden shadow-2xl">
                    {/* Glow effect on hover */}
                    <div className="absolute inset-0 bg-gradient-to-b from-blue-500/0 to-blue-500/0 group-hover:from-blue-500/5 group-hover:to-transparent transition-all duration-500" />
                    
                    <div className="text-8xl font-black text-white/5 absolute -top-4 -left-4 select-none group-hover:text-blue-500/10 group-hover:-translate-y-2 group-hover:translate-x-2 transition-all duration-500 font-display">{phase.step}</div>
                    
                    <div className="w-20 h-20 bg-slate-950 border border-white/10 flex items-center justify-center rounded-sm mb-10 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative z-20 group-hover:border-blue-500/50 group-hover:shadow-[0_0_30px_rgba(37,99,235,0.2)] transition-all duration-500">
                      <phase.icon className="h-8 w-8 text-slate-400 group-hover:text-blue-400 group-hover:scale-110 transition-all duration-500" />
                    </div>
                    
                    <h4 className="text-2xl font-bold text-white mb-2 relative z-20">{phase.title}</h4>
                    <p className="font-display text-[10px] font-bold text-blue-400/80 tracking-[0.2em] uppercase mb-6 relative z-20">{phase.en}</p>
                    <p className="text-slate-400 leading-relaxed text-base mb-10 flex-1 relative z-20 font-medium">{phase.desc}</p>
                    
                    <div className="flex flex-wrap gap-2 mt-auto relative z-20">
                      {phase.tags.map(tag => (
                        <span key={tag} className="text-[10px] font-bold text-slate-300 bg-white/5 border border-white/10 px-3 py-1.5 rounded-sm group-hover:border-white/20 transition-colors">{tag}</span>
                      ))}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Infrastructure Section */}
        <section className="py-40 relative border-y border-white/5 overflow-hidden flex items-center min-h-[80vh]">
          <div className="absolute inset-0 z-0">
            <img 
              src={networkNodes} 
              alt="Logistics Network KSA" 
              className="w-full h-full object-cover opacity-30 grayscale mix-blend-screen scale-105" 
            />
            {/* Gradients to integrate image */}
            <div className="absolute inset-0 bg-gradient-to-l from-slate-950 via-slate-950/80 to-slate-950/20" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950" />
          </div>

          <div className="container mx-auto px-4 relative z-10 flex flex-col md:flex-row gap-16 items-center">
            <div className="flex-1 md:w-1/2">
              <Reveal>
                <div className="inline-flex items-center gap-2 mb-6">
                  <div className="w-8 h-[2px] bg-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.8)]"></div>
                  <span className="font-display text-blue-400 text-[10px] font-bold tracking-[0.25em] uppercase mt-0.5">Engineered for Scale</span>
                </div>
                <h3 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-8 leading-[1.1] tracking-tight">منصة موحدة<br />مبنية للتوسع</h3>
                <p className="text-lg md:text-xl text-slate-400 mb-12 leading-relaxed font-medium border-r-2 border-white/10 pr-6">
                  نستبدل سلاسل الإمداد العشوائية والاتصالات المتشتتة بمصدر واحد موثوق. منصة مَـد توفر لك رؤية شاملة، تحكم كامل، واعتمادية تامة لعمليات التوريد في مختلف مناطق المملكة.
                </p>
              </Reveal>
            </div>
            
            <div className="flex-1 md:w-1/2 w-full">
              <Reveal delay={200} direction="fade">
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { title: "أسعار تنافسية", desc: "نجمع قوة الطلب لنضمن لك أفضل تسعير من الموردين." },
                    { title: "امتثال ضريبي", desc: "فواتير ضريبية مبسطة ومتوافقة مع هيئة الزكاة والضريبة." },
                    { title: "ضمان توفر", desc: "شبكة موردين بديلة تجنّبك انقطاع المواد الأساسية عن منشأتك." },
                    { title: "دعم مخصص", desc: "مدير حساب شخصي لضمان سلاسة عملياتك اليومية." }
                  ].map((feature, i) => (
                    <div key={i} className="bg-slate-950/60 backdrop-blur-md border border-white/5 p-6 rounded-sm hover:bg-white/5 hover:border-white/10 transition-all duration-300 group">
                      <CheckCircle2 className="h-6 w-6 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
                      <h4 className="font-bold text-white mb-2 text-lg">{feature.title}</h4>
                      <p className="text-sm text-slate-400 leading-relaxed font-medium">{feature.desc}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Fleet & Final CTA */}
        <section className="relative">
          <div className="flex flex-col md:flex-row min-h-[70vh]">
            <div className="md:w-1/2 relative min-h-[500px] md:min-h-full">
              <img 
                src={logisticsFleet} 
                alt="Delivery Fleet" 
                className="absolute inset-0 w-full h-full object-cover" 
              />
              <div className="absolute inset-0 bg-slate-950/50 mix-blend-multiply" />
              {/* Gradient to blend with text side */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent md:bg-gradient-to-l md:from-slate-950 md:via-transparent md:to-transparent" />
              
              {/* Decorative metric */}
              <div className="absolute bottom-12 right-12 bg-slate-950/80 backdrop-blur-md border border-white/10 p-6 rounded-sm max-w-[200px] hidden md:block">
                <div className="font-display text-[10px] font-bold tracking-[0.2em] text-blue-400 uppercase mb-2">Live Tracking</div>
                <div className="text-2xl font-black text-white">100% Visibility</div>
              </div>
            </div>
            
            <div className="md:w-1/2 bg-slate-950 p-12 md:p-24 lg:p-32 flex items-center justify-center relative">
              {/* Subtle background element */}
              <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />
              
              <Reveal className="w-full max-w-xl">
                <h3 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-8 leading-[1.15] tracking-tight">
                  نجمع سلاسل التوريد،<br />
                  <span className="text-blue-400">ونرقمن عملية الإمداد.</span>
                </h3>
                <p className="text-lg md:text-xl text-slate-400 mb-12 leading-relaxed font-medium">
                  نوحّد سلاسل التوريد في منظومة رقمية واحدة — نراقب المنتجات في كل مرحلة، ونتتبع كل شحنة لحظة بلحظة، ليصل كل صنف إلى منشأتك بحالته المثالية ودون انقطاع.
                </p>
                <Link href="/auth" className="inline-flex items-center justify-center h-14 px-10 text-lg font-bold bg-white text-slate-950 hover:bg-blue-50 rounded-sm gap-3 transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:shadow-[0_0_40px_rgba(255,255,255,0.25)] group">
                  انضم لشبكة مَـد
                  <ChevronLeft className="h-6 w-6 group-hover:-translate-x-1 transition-transform" />
                </Link>
              </Reveal>
            </div>
          </div>
        </section>

      </main>

      <footer className="bg-slate-950 pt-20 pb-10 border-t border-white/5 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-16">
            <div className="flex flex-col items-center md:items-start gap-4">
              <div className="bg-gradient-to-br from-blue-600 to-blue-900 p-3 rounded-sm shadow-lg shadow-blue-900/20 border border-blue-500/20">
                <Building2 className="h-7 w-7 text-white" />
              </div>
              <div className="text-center md:text-right">
                <p className="text-xl font-black tracking-tight text-white mb-1">شركة توريدات مَـد</p>
                <p className="font-display text-xs font-bold tracking-[0.3em] text-slate-500 uppercase mt-1">Madd Supplies Co.</p>
              </div>
            </div>
            
            <div className="flex flex-wrap justify-center gap-8 font-display text-xs font-bold tracking-[0.1em] text-slate-500 uppercase">
               <span>Platform</span>
               <span>Suppliers</span>
               <span>Logistics</span>
               <span>Contact</span>
            </div>
          </div>
          
          <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-medium text-slate-500">
            <p>
              © {new Date().getFullYear()} شركة توريدات مَـد. المملكة العربية السعودية. جميع الحقوق محفوظة.
            </p>
            <p className="font-display tracking-[0.2em] uppercase text-blue-500/50">
              Critical National Infrastructure
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
