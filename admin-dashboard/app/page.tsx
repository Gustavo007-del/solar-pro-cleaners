import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Brush, CalendarCheck, ShieldCheck, Sun } from 'lucide-react';
import styles from './landing.module.css';

export const metadata: Metadata = {
  title: 'Professional Solar Panel Cleaning',
  description: 'Request a Solar Care panel cleaning visit. Tell us about your installation and we’ll help confirm availability and arrange a visit.',
  robots: { index: true, follow: true },
};

const support = 'https://solar-pro-cleaners.onrender.com';
const steps = ['Contact Solar Care', 'Share your installation details', 'Confirm service availability', 'Schedule the visit', 'Get your panels cleaned'];

async function publicData(path: 'contact-us' | 'service-areas') {
  try {
    const url = new URL(process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || support);
    url.pathname = (url.pathname.replace(/\/+$/, '') || '/api/v1') + '/' + path;
    const response = await fetch(url, { next: { revalidate: 600 }, signal: AbortSignal.timeout(2500) });
    if (response.ok) return await response.json();
  } catch { /* Public contact fallback remains available while the API wakes up. */ }
  return null;
}

export default async function Home() {
  const [businessData, areaData] = await Promise.all([publicData('contact-us'), publicData('service-areas')]);
  const business = (businessData ?? {}) as { support_email?: string; primary_phone?: string };
  const areas = (areaData?.items ?? []) as { name: string }[];
  const terms = process.env.NEXT_PUBLIC_TERMS_URL;
  const phone = business.primary_phone && /^\+[1-9]\d{7,14}$/.test(business.primary_phone) ? business.primary_phone : '+919061444017';
  const email = business.support_email && /^[^@\s?]+@[^@\s?]+$/.test(business.support_email) ? business.support_email : null;
  return <div className={styles.site}>
    <header className={styles.header} id="home">
      <a className={styles.brand} href="#home"><Sun aria-hidden />Solar Care</a>
      <nav aria-label="Main navigation">
        <a href="#home">Home</a><a href="#services">Our Services</a><a href="#process">How It Works</a>
        <a href="#why">Why Choose Us</a><a href="#contact">Contact</a>
      </nav>
      <Link className={styles.login} href="/login">Admin Login <ArrowUpRight size={16} aria-hidden /></Link>
    </header>
    <main>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Solar panel cleaning</p>
          <h1 id="hero-title">Keep your solar panels clean.</h1>
          <p>Professional cleaning for your solar installation. Tell us where your panels are and we’ll help arrange a visit.</p>
          <div className={styles.actions}>
            <a className={styles.primary} href="#contact">Request a cleaning <ArrowUpRight size={18} aria-hidden /></a>
            <a href="#services">Explore our service</a>
          </div>
        </div>
        <div className={styles.heroImage}>
          <Image src="/solar-cleaning.jpg" alt="A technician cleaning a rooftop solar array with a water-fed brush" fill sizes="(max-width: 800px) 100vw, 52vw" preload />
        </div>
      </section>
      <section className={styles.section} id="services">
        <div><p className={styles.eyebrow}>Our service</p><h2>On-site solar panel cleaning</h2></div>
        <div><p>Dust, leaves, and bird droppings can build up on exposed panels. A cleaning visit removes surface buildup and helps you maintain your installation.</p>
          <p>Tell us how the panels are installed and how they can be accessed. We’ll discuss the site with you before the visit so you can avoid attempting unsafe roof access yourself.</p></div>
      </section>
      <section className={styles.process} id="process">
        <h2>How it works</h2><ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>
      </section>
      <section className={styles.section} id="why">
        <div><p className={styles.eyebrow}>Why Solar Care</p><h2>A clear process from first call to cleaning day.</h2></div>
        <ul className={styles.reasons}>
          <li><ShieldCheck aria-hidden />We discuss access and site details before scheduling.</li>
          <li><Brush aria-hidden />The visit is focused on cleaning the panel surfaces.</li>
          <li><CalendarCheck aria-hidden />You can request a visit before choosing a date.</li>
        </ul>
      </section>
      <section className={styles.contact} id="contact">
        <h2>Arrange a cleaning visit</h2>
        <p>Share your location and the approximate number of panels so we can confirm availability.</p>
        {areas.length > 0 && <p>Listed service areas: {areas.map((area) => area.name).join(', ')}.</p>}
        <div className={styles.actions}>
          <a className={styles.primary} href={'tel:' + phone}>Call {phone}</a>
          <a href="https://wa.me/919061444017">Chat on WhatsApp</a>
          {email && <a href={'mailto:' + email}>Email {email}</a>}
        </div>
      </section>
    </main>
    <footer className={styles.footer}>
      <a className={styles.brand} href="#home"><Sun aria-hidden />Solar Care</a>
      <a href="#services">Services</a><a href="#contact">Contact</a>
      <a href={support + '/privacy-policy'}>Privacy Policy</a>
      {terms?.startsWith('https://') && <a href={terms}>Terms and Conditions</a>}
      <Link href="/login">Admin Login</Link>
    </footer>
  </div>;
}
