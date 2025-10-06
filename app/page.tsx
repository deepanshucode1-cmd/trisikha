import AboutBusiness from "@/components/AboutBusiness";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Offerings from "@/components/Offerings";
import OrganicManureSection from "@/components/OrganicsManureSection";
import Test from "@/components/Test";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="font-sans min-h-screen flex flex-col">
      
      <Header/>

      <Hero/>
      <Offerings/>
      <OrganicManureSection/>
      <AboutBusiness/>
      <Footer/>
      
    </div>
  );
}
