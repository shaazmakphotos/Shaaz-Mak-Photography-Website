import { Link } from "react-router-dom";
import { Instagram, Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-secondary/50 border-t border-border">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Brand */}
          <div className="space-y-4">
            <h3 className="text-2xl font-serif font-medium">Shaaz Mak</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Capturing life's most precious moments with an eye for the extraordinary.
              Wedding & event photography that tells your unique story.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-widest text-foreground">
              Quick Links
            </h4>
            <nav className="flex flex-col gap-2">
              <Link
                to="/portfolio"
                className="text-muted-foreground hover:text-primary transition-colors text-sm"
              >
                Portfolio
              </Link>
              <Link
                to="/about"
                className="text-muted-foreground hover:text-primary transition-colors text-sm"
              >
                About
              </Link>
              <Link
                to="/contact"
                className="text-muted-foreground hover:text-primary transition-colors text-sm"
              >
                Contact
              </Link>
              <Link
                to="/login"
                className="text-muted-foreground hover:text-primary transition-colors text-sm"
              >
                Client Login
              </Link>
            </nav>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-widest text-foreground">
              Get in Touch
            </h4>
            <div className="flex flex-col gap-3">
              <a
                href="mailto:Shaazmakphotography@gmail.com"
                className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm"
              >
                <Mail className="w-4 h-4" />
                Shaazmakphotography@gmail.com
              </a>
              <a
                href="https://instagram.com/ShaazMaknojiya"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm"
              >
                <Instagram className="w-4 h-4" />
                @ShaazMaknojiya
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} Shaaz Mak Photography. All rights reserved.
          </p>
          <p className="text-muted-foreground text-xs">
            Crafted with love for beautiful moments
          </p>
        </div>
      </div>
    </footer>
  );
}
