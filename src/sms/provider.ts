export type InternalStatus = 'queued' | 'submitted' | 'sent' | 'delivered' | 'failed' | 'rejected' | 'unknown';
export interface SendResult { providerMessageId?: string; status: InternalStatus; errorCode?: string; uncertain?: boolean }
export interface SmsProvider {
  sendMessage(to: string, body: string, senderId: string): Promise<SendResult>;
  sendBulkMessages(items: { to: string; body: string }[], senderId: string): Promise<SendResult[]>;
  sendOtp(to: string, code: string, senderId: string): Promise<SendResult>;
  checkBalance(): Promise<number>;
  getMessageStatus(providerMessageId: string): Promise<InternalStatus>;
  getDeliveryReport(providerMessageId: string): Promise<{ status: InternalStatus; raw?: unknown }>;
  validateSenderId(name: string): Promise<boolean>;
}
// Mock only: for dev/tests. A real adapter must be written from the provider's actual docs.
export class MockProvider implements SmsProvider {
  async sendMessage(to: string) { return { providerMessageId: 'mock-' + Date.now() + to.slice(-4), status: 'submitted' as const }; }
  async sendBulkMessages(items: { to: string; body: string }[]) { return Promise.all(items.map(i => this.sendMessage(i.to))); }
  async sendOtp(to: string) { return this.sendMessage(to); }
  async checkBalance() { return 0; }
  async getMessageStatus(): Promise<InternalStatus> { return 'delivered'; }
  async getDeliveryReport() { return { status: 'delivered' as InternalStatus }; }
  async validateSenderId() { return true; }
}
export function getProvider(): SmsProvider {
  if ((process.env.SMS_PROVIDER ?? 'mock') === 'mock') return new MockProvider();
  throw new Error('No real SMS adapter implemented yet: supply provider docs and credentials.');
}
