import { Link, useLocation, useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import logo from "@/assets/logo.png";
import { clearAuth, getStoredUser } from "@/api/auth";

const links = [
  { to: "/", label: "New Analysis" },
  { to: "/jobs", label: "My Jobs" },
];

export function Navbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    clearAuth();
    navigate("/login");
  };

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-8">
      <Link to="/" className="flex items-center gap-2">
        <img src={logo} alt="Secretome Profiler" className="h-32 w-auto" />
      </Link>

      <div className="flex gap-4 flex-1">
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

      {user && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500 hidden sm:block">{user.email}</span>
          {!user.has_api_key && (
            <Link
              to="/settings"
              className="px-3 py-1.5 bg-yellow-50 border border-yellow-300 text-yellow-700 rounded-lg text-xs font-medium hover:bg-yellow-100 transition-colors"
            >
              ⚠ Add API key
            </Link>
          )}
          <Link
            to="/settings"
            className={clsx(
              "text-sm font-medium transition-colors",
              pathname === "/settings"
                ? "text-primary-600"
                : "text-gray-500 hover:text-gray-800"
            )}
          >
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
