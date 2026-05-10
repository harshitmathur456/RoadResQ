const TEXTBEE_API_KEY = '5609cf1d-b55b-4d0f-8c83-16755795cc88';
const TEXTBEE_DEVICE_ID = '69b50a04eb0b29634c65b423';

interface SendSmsResult {
    success: boolean;
    error?: string;
}

/**
 * Sends an SMS message via the TextBee API.
 * Calls the API directly (TextBee supports CORS from browser).
 */
export const sendSmsViaTextBee = async (
    recipientPhone: string,
    message: string
): Promise<SendSmsResult> => {
    try {
        // Call TextBee API directly
        const url = `https://api.textbee.dev/api/v1/gateway/devices/${TEXTBEE_DEVICE_ID}/send-sms`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': TEXTBEE_API_KEY,
            },
            body: JSON.stringify({
                recipients: [recipientPhone],
                message: message,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('TextBee API error:', response.status, errorData);
            return {
                success: false,
                error: errorData?.message || `HTTP ${response.status}: ${response.statusText}`,
            };
        }

        const data = await response.json();
        console.log('SMS sent successfully via TextBee:', data);
        return { success: true };
    } catch (error) {
        console.error('Failed to send SMS via TextBee:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown network error',
        };
    }
};
