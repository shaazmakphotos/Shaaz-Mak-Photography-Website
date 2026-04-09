import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
const publicNavLinks = [{
  name: "Home",
  path: "/"
}, {
  name: "Portfolio",
  path: "/portfolio"
}, {
  name: "About",
  path: "/about"
}, {
  name: "Contact",
  path: "/contact"
}];
export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const {
    user,
    isAdmin,
    isClient,
    signOut
  } = useAuth();
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);
  const getNavLinks = () => {
    if (isAdmin) {
      return [...publicNavLinks, {
        name: "Admin",
        path: "/admin"
      }];
    }
    if (isClient) {
      return [...publicNavLinks, {
        name: "Album",
        path: "/my-album"
      }];
    }
    return publicNavLinks;
  };
  const navLinks = getNavLinks();
  return <nav className={cn("fixed top-0 left-0 right-0 z-50 transition-all duration-500", isScrolled ? "bg-background/95 backdrop-blur-md shadow-soft py-4" : "bg-transparent py-6")}>
      <div className="container mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="text-2xl md:text-3xl font-serif font-medium tracking-wider text-foreground hover:text-primary transition-colors">SHAAZ MAK</Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map(link => <Link key={link.path} to={link.path} className={cn("text-sm font-medium tracking-widest uppercase transition-colors relative group", location.pathname === link.path ? "text-primary" : "text-foreground hover:text-primary")}>
              {link.name}
              <span className={cn("absolute -bottom-1 left-0 h-px bg-primary transition-all duration-300", location.pathname === link.path ? "w-full" : "w-0 group-hover:w-full")} />
            </Link>)}
          
          {user ? <Button variant="outline" size="sm" onClick={signOut} className="border-primary/30 text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-300">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button> : <Link to="/login">
              <Button variant="outline" size="sm" className="border-primary/30 text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-300">
                <User className="w-4 h-4 mr-2" />
                Client Login
              </Button>
            </Link>}
        </div>

        {/* Mobile Menu Button */}
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden text-foreground p-2" aria-label="Toggle menu">
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <div className={cn("md:hidden fixed inset-0 z-40 bg-background transition-all duration-300 overflow-hidden", isMobileMenuOpen ? "opacity-100 visible pointer-events-auto" : "opacity-0 invisible pointer-events-none")}>
        {/* Close button inside menu */}
        <div className="absolute top-6 right-6">
          <button onClick={() => setIsMobileMenuOpen(false)} className="text-foreground p-2 hover:text-primary transition-colors" aria-label="Close menu">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="container mx-auto px-6 flex flex-col gap-4 pt-20 pb-6">
          {navLinks.map(link => <Link key={link.path} to={link.path} onClick={() => setIsMobileMenuOpen(false)} className={cn("text-lg font-medium py-2 border-b border-border/50 transition-colors", location.pathname === link.path ? "text-primary" : "text-foreground hover:text-primary")}>
              {link.name}
            </Link>)}
          {user ? <Button variant="outline" onClick={() => {
          setIsMobileMenuOpen(false);
          signOut();
        }} className="w-full mt-2 border-primary/30 text-foreground hover:bg-primary hover:text-primary-foreground">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button> : <Link to="/login" onClick={() => setIsMobileMenuOpen(false)}>
              <Button variant="outline" className="w-full mt-2 border-primary/30 text-foreground hover:bg-primary hover:text-primary-foreground">
                <User className="w-4 h-4 mr-2" />
                Client Login
              </Button>
            </Link>}
        </div>
      </div>
    </nav>;
}