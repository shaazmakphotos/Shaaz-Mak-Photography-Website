import { Layout } from "@/components/layout/Layout";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Camera, Heart, Sparkles } from "lucide-react";

const highlights = [
  {
    icon: Camera,
    title: "10+ Years",
    description: "Professional photography experience capturing weddings and events",
  },
  {
    icon: Heart,
    title: "200+ Couples",
    description: "Trusted by hundreds of couples to document their special day",
  },
  {
    icon: Sparkles,
    title: "Natural, Timeless Editing",
    description: "Light, airy, and true to you",
  },
];

export default function About() {
  return (
    <Layout>
      {/* Hero Section */}
      <section className="pt-32 pb-16 bg-background">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <p className="text-primary font-medium tracking-[0.3em] uppercase text-sm">
                About Me
              </p>
              <h1 className="text-5xl md:text-6xl font-serif">
                The Story Behind the Lens
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Hello! I'm Shaaz Mak, a wedding and event photographer with a passion
                for capturing life's most beautiful moments. My journey began over a
                decade ago when I picked up my first camera, and I've been in love
                with photography ever since.
              </p>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1554048612-b6a482bc67e5?w=800&q=80"
                alt="Shaaz Mak - Photographer"
                className="rounded-lg shadow-elevated w-full"
              />
              <div className="absolute -bottom-8 -right-8 w-48 h-48 border-2 border-primary/20 rounded-lg -z-10" />
            </div>
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="py-16 bg-secondary/30">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8">
            {highlights.map((highlight, index) => (
              <div
                key={index}
                className="text-center p-8 bg-background rounded-lg shadow-soft hover-lift"
              >
                <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                  <highlight.icon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-2xl font-serif mb-2">{highlight.title}</h3>
                <p className="text-muted-foreground text-sm">{highlight.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <p className="text-primary font-medium tracking-[0.3em] uppercase text-sm">
              My Philosophy
            </p>
            <h2 className="text-4xl md:text-5xl font-serif">
              Capturing Authentic Moments
            </h2>
            <div className="space-y-6 text-muted-foreground leading-relaxed text-lg">
              <p>
                I believe that the best photographs are those that capture genuine
                emotions and authentic moments. My approach is unobtrusive – I blend
                into your special day, allowing you to be fully present while I
                document the magic unfolding around you.
              </p>
              <p>
                Every wedding, every event, every couple is unique. That's why I take
                the time to understand your vision, your style, and your story. The
                result? Images that truly reflect who you are and the love you share.
              </p>
              <p>
                My style is light and airy with warm, natural tones. I love soft light,
                candid moments, and the little details that make your day special.
                Whether it's a stolen glance, a heartfelt laugh, or a tender embrace,
                these are the moments I live to capture.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-24 bg-secondary/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16 space-y-4">
            <p className="text-primary font-medium tracking-[0.3em] uppercase text-sm">
              The Process
            </p>
            <h2 className="text-4xl md:text-5xl font-serif">How We Work Together</h2>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                step: "01",
                title: "Connect",
                description: "We start with a conversation about your vision and expectations",
              },
              {
                step: "02",
                title: "Plan",
                description: "Together, we create a timeline and discuss all the details",
              },
              {
                step: "03",
                title: "Capture",
                description: "On your special day, I document every precious moment",
              },
              {
                step: "04",
                title: "Deliver",
                description: "Receive your beautifully edited photos in your private gallery",
              },
            ].map((item, index) => (
              <div key={index} className="text-center space-y-4">
                <span className="text-5xl font-serif text-primary/30">{item.step}</span>
                <h3 className="text-xl font-serif">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-6 text-center">
          <div className="max-w-2xl mx-auto space-y-8">
            <h2 className="text-4xl md:text-5xl font-serif">Ready to Get Started?</h2>
            <p className="text-muted-foreground text-lg">
              I'd love to hear about your upcoming event and discuss how we can create
              beautiful memories together.
            </p>
            <Link to="/contact">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-accent px-10 py-6 text-sm tracking-widest uppercase"
              >
                Let's Talk
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
