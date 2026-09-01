import WebVitals from "./web-vitals";

/** Analytics is deliberately mounted only on the content-free login screen. */
export default function PublicAnalytics() {
  return (
    <>
      <WebVitals />
      <script async src="https://www.googletagmanager.com/gtag/js?id=G-PTX99GX5F9" />
      <script
        id="google-analytics"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-PTX99GX5F9', {
  anonymize_ip: true,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
  cookie_flags: 'SameSite=Lax;Secure'
});`
        }}
      />
    </>
  );
}
