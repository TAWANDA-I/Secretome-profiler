import { Link, useLocation } from "react-router-dom";
import { clsx } from "clsx";
import logo from "@/assets/logo.png";

const links = [
  { to: "/", label: "New Analysis" },
  { to: "/jobs", label: "My Jobs" },
];

export function Navbar() {
  const { pathname } = useLocation();
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-8">
      <Link to="/" className="flex items-center gap-2">
        <img src={logo} alt="Secretome Profiler" className="h-32 w-auto" />
      </Link>
      <div className="flex gap-4">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={clsx(
              "text-sm font-medium transition-colors",
              pathname === l.to
                ? "text-primary-600 border-b-2 border-primary-600 pb-0.5"
                : "text-gray-500 hover:text-gray-800"
            )}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
