import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Zap, BarChart3, Users, ShoppingCart, Bot, Bell, Shield, ArrowRight,
  CheckCircle2, Star, ChevronRight, Globe,
} from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = { initial: { opacity: 0, y: 30 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };

const FEATURES = [
  { icon: BarChart3, title: "Smart Analytics", desc: "Real-time dashboards with AI-powered business health scoring" },
  { icon: Users, title: "Customer Management", desc: "Track customers, import bulk data, and manage relationships" },
  { icon: ShoppingCart, title: "Order Tracking", desc: "Full order lifecycle with status tracking and revenue insights" },
  { icon: Bot, title: "AI Assistant", desc: "Ask questions about your business data in natural language" },
  { icon: Bell, title: "Smart Notifications", desc: "Automated alerts for orders, tasks, and customer activity" },
  { icon: Shield, title: "Role-Based Access", desc: "Control who can view and manage different parts of your business" },
];

const TESTIMONIALS = [
  { name: "Grace Wanjiku", role: "Retail Owner, Nairobi", text: "SmartOps transformed how I manage my shop. I can track everything from my phone.", rating: 5 },
  { name: "James Ochieng", role: "Wholesaler, Kisumu", text: "The AI assistant helps me understand my business trends without complex reports.", rating: 5 },
  { name: "Amina Hassan", role: "E-commerce, Mombasa", text: "Importing my customer data from Excel was so easy. Saved me hours of manual entry.", rating: 5 },
];

const PLANS = [
  { name: "Free", price: "0", currency: "Ksh", features: ["Up to 50 customers", "Up to 100 orders", "Basic analytics", "1 team member"], cta: "Get Started", popular: false },
  { name: "Starter", price: "2,500", currency: "Ksh", features: ["Up to 500 customers", "Unlimited orders", "AI Assistant", "5 team members", "Email notifications", "File imports"], cta: "Start Free Trial", popular: true },
  { name: "Pro", price: "7,500", currency: "Ksh", features: ["Unlimited customers", "Unlimited orders", "Advanced AI insights", "Unlimited team", "Priority support", "Custom automations", "API access"], cta: "Contact Sales", popular: false },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">SmartOps</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">Testimonials</a>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/auth"><Button variant="ghost" size="sm">Sign In</Button></Link>
            <Link to="/auth"><Button size="sm">Get Started <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="max-w-7xl mx-auto px-6 py-24 md:py-32 text-center relative">
          <motion.div {...fadeUp}>
            <Badge className="mb-6">
              <Globe className="h-3 w-3 mr-1" /> Built for African Businesses
            </Badge>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight max-w-4xl mx-auto leading-[1.1]">
              Your Business
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"> Command Center</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mt-6">
              Track customers, manage orders, and grow your business with AI-powered insights. All in one beautiful platform.
            </p>
            <div className="flex items-center justify-center gap-4 mt-10">
              <Link to="/auth"><Button size="lg" className="text-base px-8">Start Free <ArrowRight className="h-4 w-4 ml-2" /></Button></Link>
              <Link to="/demo"><Button size="lg" variant="outline" className="text-base px-8">Try Demo</Button></Link>
            </div>
            <p className="text-xs text-muted-foreground mt-4">No credit card required · Free forever plan available</p>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <motion.div {...fadeUp} className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold">Everything You Need to Run Your Business</h2>
          <p className="text-muted-foreground mt-4 text-lg">Powerful tools designed for small and medium businesses</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} {...fadeUp} transition={{ delay: i * 0.1 }}>
              <Card className="glass glass-hover h-full">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <f.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                  <p className="text-muted-foreground text-sm">{f.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="bg-muted/30 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div {...fadeUp} className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold">Loved by Business Owners</h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div key={t.name} {...fadeUp} transition={{ delay: i * 0.1 }}>
                <Card className="glass h-full">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex gap-1">{Array.from({ length: t.rating }).map((_, j) => <Star key={j} className="h-4 w-4 fill-warning text-warning" />)}</div>
                    <p className="text-sm text-muted-foreground italic">"{t.text}"</p>
                    <div>
                      <p className="font-semibold text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-7xl mx-auto px-6 py-24">
        <motion.div {...fadeUp} className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold">Simple, Transparent Pricing</h2>
          <p className="text-muted-foreground mt-4 text-lg">Start free, scale as you grow</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PLANS.map((plan, i) => (
            <motion.div key={plan.name} {...fadeUp} transition={{ delay: i * 0.1 }}>
              <Card className={`h-full relative ${plan.popular ? "border-primary shadow-lg shadow-primary/10 scale-105" : "glass"}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{plan.currency} {plan.price}</span>
                    <span className="text-muted-foreground text-sm">/month</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link to="/auth">
                    <Button className="w-full" variant={plan.popular ? "default" : "outline"}>{plan.cta}</Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary/5 py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <motion.div {...fadeUp}>
            <h2 className="text-3xl md:text-4xl font-bold">Ready to Transform Your Business?</h2>
            <p className="text-muted-foreground mt-4 text-lg">Join hundreds of businesses already using SmartOps</p>
            <Link to="/auth">
              <Button size="lg" className="mt-8 text-base px-10">Get Started for Free <ChevronRight className="h-4 w-4 ml-1" /></Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">SmartOps</span>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} SmartOps. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary ${className}`}>
      {children}
    </span>
  );
}
