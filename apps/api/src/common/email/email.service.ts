import { Injectable, Logger } from "@nestjs/common";

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

// Stubbed for Phase 2: logs instead of sending. Swap the body of sendMail
// for a real provider (Resend, per docs/architecture.md Section E) when
// notifications become a real requirement — no call sites need to change.
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendMail(input: SendEmailInput): Promise<void> {
    this.logger.log(
      `[dev email stub] To: ${input.to} | Subject: ${input.subject}\n${input.body}`,
    );
  }
}
