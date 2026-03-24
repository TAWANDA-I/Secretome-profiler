import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Home from "@/pages/Home";
import Jobs from "@/pages/Jobs";
import JobStatus from "@/pages/JobStatus";
import Results from "@/pages/Results";
import ComparisonResults from "@/pages/ComparisonResults";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Settings from "@/pages/Settings";
import { isAuthenticated } from "@/api/auth";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 2 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  if (isAuthenticated()) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <div className="min-h-screen flex flex-col bg-gray-50">
                  <Navbar />
                  <main className="flex-1">
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/jobs" element={<Jobs />} />
                      <Route path="/jobs/:jobId" element={<JobStatus />} />
                      <Route path="/results/:jobId" element={<Results />} />
                      <Route path="/comparison/:jobId" element={<ComparisonResults />} />
                    </Routes>
                  </main>
                  <Footer />
                </div>
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
