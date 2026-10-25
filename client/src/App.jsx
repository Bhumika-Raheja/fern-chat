import { useEffect, useState } from "react";
import { api } from "./api/client";
import FernLogo from "./components/FernLogo";

export default function App() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    api
      .get("/health")
      .then(() => setStatus("online"))
      .catch(() => setStatus("offline"));
  }, []);

  const dotColor =
    status === "online" ? "bg-online" : status === "offline" ? "bg-danger" : "bg-offline";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <FernLogo size={64} />
      <h1 className="text-3xl font-semibold text-primary">Fern</h1>
      <p className="text-muted">Conversations that grow.</p>
      <span className="flex items-center gap-2 text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
        Server: {status}
      </span>
    </div>
  );
}