import { Header } from "@/components/header";
import { MainApp } from "@/components/main-app";

export default function Home() {
  return (
    <div className="flex flex-col h-screen">
      <Header />
      <MainApp />
    </div>
  );
}
