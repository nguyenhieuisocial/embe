'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export default function StudioNav(){const path=usePathname();return <nav className="studio-nav" aria-label="Điều hướng Studio">{[['/studio','Video'],['/studio/ban-lam-viec','Bản nháp'],['/studio/duyet-dang','Duyệt & đăng'],['/studio/kham-pha','Khám phá'],['/studio/nghien-cuu','Nghiên cứu']].map(([url,label])=><Link key={url} href={url} aria-current={path===url||url==='/studio/ban-lam-viec'&&path==='/studio/soan'?'page':undefined}>{label}</Link>)}</nav>;}
