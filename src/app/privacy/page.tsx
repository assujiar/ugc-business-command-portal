import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy - UGC Business Command Portal',
  description: 'Privacy Policy for UGC Business Command Portal by PT Utama Global Indo Cargo',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: February 11, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Introduction</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              PT Utama Global Indo Cargo (&quot;the Company&quot;, &quot;we&quot;, &quot;us&quot;) operates the UGC Business
              Command Portal (&quot;the Portal&quot;). This Privacy Policy explains how we collect, use,
              store, and protect information when you use our Portal and related services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Information We Collect</h2>
            <h3 className="text-base font-medium mt-4 mb-2">2.1 Account Information</h3>
            <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
              <li>Name, email address, and role within the organization</li>
              <li>Login credentials and authentication data</li>
              <li>Profile information and preferences</li>
            </ul>

            <h3 className="text-base font-medium mt-4 mb-2">2.2 Usage Data</h3>
            <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
              <li>Pages visited, features used, and actions taken within the Portal</li>
              <li>Device information, browser type, and IP address</li>
              <li>Timestamps and session duration</li>
            </ul>

            <h3 className="text-base font-medium mt-4 mb-2">2.3 Business Data</h3>
            <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
              <li>CRM data: customer records, leads, opportunities, and communications</li>
              <li>Ticketing data: support tickets, quotations, and shipment information</li>
              <li>Marketing data: analytics from connected platforms (Google, TikTok, social media)</li>
            </ul>

            <h3 className="text-base font-medium mt-4 mb-2">2.4 Third-Party Data</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              When you connect third-party services (Google Search Console, Google Analytics,
              Google Ads, TikTok for Business, etc.), we receive and store OAuth tokens and
              analytics data as authorized by your consent during the connection process.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. How We Use Information</h2>
            <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
              <li>To provide and maintain the Portal and its features</li>
              <li>To authenticate users and manage access control</li>
              <li>To display business analytics and reporting dashboards</li>
              <li>To process and track customer interactions, tickets, and quotations</li>
              <li>To improve the Portal&apos;s functionality and user experience</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Data Storage and Security</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We use industry-standard security measures to protect your data:
            </p>
            <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground mt-2">
              <li>Data is stored in Supabase (PostgreSQL) with Row Level Security (RLS) policies</li>
              <li>Authentication is managed through Supabase Auth with secure session handling</li>
              <li>All data transmission uses HTTPS encryption</li>
              <li>OAuth tokens for third-party services are stored securely in the database</li>
              <li>Access to data is restricted based on user roles and permissions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Data Sharing</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We do not sell, trade, or rent your personal information to third parties.
              We may share data only in the following circumstances:
            </p>
            <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground mt-2">
              <li>With service providers who assist in operating the Portal (e.g., Supabase, Vercel)</li>
              <li>When required by law or to comply with legal processes</li>
              <li>To protect the rights and safety of the Company and its users</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Third-Party Services</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The Portal integrates with third-party platforms. Each has its own privacy policy:
            </p>
            <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground mt-2">
              <li>Google APIs (Search Console, Analytics, Ads, PageSpeed) - subject to Google&apos;s Privacy Policy</li>
              <li>TikTok for Business - subject to TikTok&apos;s Privacy Policy</li>
              <li>Supabase - subject to Supabase&apos;s Privacy Policy</li>
              <li>Vercel - subject to Vercel&apos;s Privacy Policy</li>
            </ul>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              We encourage you to review the privacy policies of these third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Data Retention</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We retain your data for as long as your account is active or as needed to provide
              services. Business data (CRM records, tickets, analytics) is retained in accordance
              with our data retention policies and applicable legal requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Your Rights</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Subject to applicable laws, you have the right to:
            </p>
            <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground mt-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data (subject to legal retention requirements)</li>
              <li>Disconnect third-party service integrations at any time through the Portal settings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Cookies</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The Portal uses essential cookies for authentication and session management.
              These cookies are necessary for the Portal to function properly and cannot be
              disabled while using the Portal.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Changes to This Policy</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. Changes will be posted on
              this page with an updated &quot;Last updated&quot; date. Your continued use of the Portal
              after any changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">11. Contact Us</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              For questions or concerns about this Privacy Policy, please contact:<br />
              <strong>PT Utama Global Indo Cargo</strong><br />
              Email: cargo.ugc@gmail.com
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
