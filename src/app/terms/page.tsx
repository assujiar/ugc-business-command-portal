import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service - UGC Business Command Portal',
  description: 'Terms of Service for UGC Business Command Portal by PT Utama Global Indo Cargo',
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: February 11, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Acceptance of Terms</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              By accessing and using the UGC Business Command Portal (&quot;the Portal&quot;), operated by
              PT Utama Global Indo Cargo (&quot;the Company&quot;, &quot;we&quot;, &quot;us&quot;), you agree to be bound by
              these Terms of Service. If you do not agree with any part of these terms, you may
              not access or use the Portal.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Description of Service</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The Portal is an internal business management platform that provides Customer Relationship
              Management (CRM), ticketing, marketing analytics, and operational tools for authorized
              employees and business partners of PT Utama Global Indo Cargo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. User Accounts</h2>
            <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
              <li>Access to the Portal is granted by authorized administrators only.</li>
              <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
              <li>You must not share your login credentials with any unauthorized person.</li>
              <li>You must notify us immediately of any unauthorized use of your account.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Acceptable Use</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">You agree not to:</p>
            <ul className="list-disc ml-5 space-y-1 text-sm text-muted-foreground">
              <li>Use the Portal for any unlawful purpose or in violation of any applicable laws.</li>
              <li>Attempt to gain unauthorized access to any part of the Portal or its related systems.</li>
              <li>Interfere with or disrupt the Portal or servers connected to the Portal.</li>
              <li>Upload or transmit any viruses, malware, or other malicious code.</li>
              <li>Use automated tools to scrape or extract data from the Portal without authorization.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Third-Party Services</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The Portal integrates with third-party services including but not limited to Google APIs
              (Search Console, Analytics, Ads, PageSpeed), TikTok for Business, and social media
              platforms. Your use of these integrations is also subject to the respective third-party
              terms of service and privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Intellectual Property</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              All content, features, and functionality of the Portal are owned by PT Utama Global
              Indo Cargo and are protected by applicable intellectual property laws. You may not
              reproduce, distribute, or create derivative works without our express written consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Data and Confidentiality</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              All business data accessed through the Portal is confidential. You agree to maintain
              the confidentiality of all data and not disclose any business information to unauthorized
              parties. This obligation continues even after your access to the Portal is terminated.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Limitation of Liability</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The Portal is provided &quot;as is&quot; without warranties of any kind. To the fullest extent
              permitted by law, the Company shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages arising from your use of the Portal.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Termination</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We reserve the right to suspend or terminate your access to the Portal at any time,
              with or without cause, and with or without notice. Upon termination, your right to
              use the Portal will immediately cease.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Changes to Terms</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We reserve the right to modify these Terms of Service at any time. Changes will be
              effective immediately upon posting. Your continued use of the Portal after any changes
              constitutes acceptance of the modified terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">11. Governing Law</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the
              Republic of Indonesia. Any disputes arising from these Terms shall be subject to
              the exclusive jurisdiction of the courts of Jakarta, Indonesia.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">12. Contact</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              For questions regarding these Terms of Service, please contact:<br />
              <strong>PT Utama Global Indo Cargo</strong><br />
              Email: cargo.ugc@gmail.com
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
