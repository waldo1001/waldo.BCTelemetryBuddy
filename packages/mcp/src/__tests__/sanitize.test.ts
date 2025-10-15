import {
    redactEmails,
    maskIPs,
    maskGUIDs,
    redactPhones,
    redactSensitiveURLs,
    sanitize,
    sanitizeObject
} from '../sanitize.js';

describe('Sanitization Module', () => {
    describe('redactEmails', () => {
        it('should redact email addresses', () => {
            // Arrange
            const text = 'Contact us at support@example.com or admin@test.org for help.';

            // Act
            const result = redactEmails(text);

            // Assert
            expect(result).toBe('Contact us at [EMAIL_REDACTED] or [EMAIL_REDACTED] for help.');
        });

        it('should handle text without emails', () => {
            // Arrange
            const text = 'This text has no email addresses.';

            // Act
            const result = redactEmails(text);

            // Assert
            expect(result).toBe(text);
        });

        it('should handle complex email formats', () => {
            // Arrange
            const text = 'Emails: user.name+tag@sub.domain.com, test_user123@example.co.uk';

            // Act
            const result = redactEmails(text);

            // Assert
            expect(result).toBe('Emails: [EMAIL_REDACTED], [EMAIL_REDACTED]');
        });
    });

    describe('maskIPs', () => {
        it('should partially mask IPv4 addresses', () => {
            // Arrange
            const text = 'Server IP: 192.168.1.100, Client IP: 10.0.0.50';

            // Act
            const result = maskIPs(text);

            // Assert
            expect(result).toBe('Server IP: 192.168.xxx.xxx, Client IP: 10.0.xxx.xxx');
        });

        it('should handle text without IPs', () => {
            // Arrange
            const text = 'No IP addresses here.';

            // Act
            const result = maskIPs(text);

            // Assert
            expect(result).toBe(text);
        });

        it('should preserve first two octets', () => {
            // Arrange
            const text = '172.16.254.1';

            // Act
            const result = maskIPs(text);

            // Assert
            expect(result).toBe('172.16.xxx.xxx');
        });
    });

    describe('maskGUIDs', () => {
        it('should partially mask GUIDs', () => {
            // Arrange
            const text = 'User ID: 550e8400-e29b-41d4-a716-446655440000, Session: 6ba7b810-9dad-11d1-80b4-00c04fd430c8';

            // Act
            const result = maskGUIDs(text);

            // Assert
            expect(result).toBe('User ID: 550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx, Session: 6ba7b810-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
        });

        it('should handle uppercase GUIDs', () => {
            // Arrange
            const text = 'ID: 550E8400-E29B-41D4-A716-446655440000';

            // Act
            const result = maskGUIDs(text);

            // Assert
            expect(result).toBe('ID: 550E8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
        });

        it('should handle mixed case GUIDs', () => {
            // Arrange
            const text = 'ID: 550e8400-E29B-41d4-A716-446655440000';

            // Act
            const result = maskGUIDs(text);

            // Assert
            expect(result).toBe('ID: 550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
        });

        it('should handle text without GUIDs', () => {
            // Arrange
            const text = 'No GUIDs here.';

            // Act
            const result = maskGUIDs(text);

            // Assert
            expect(result).toBe(text);
        });
    });

    describe('redactPhones', () => {
        it('should redact phone numbers in various formats', () => {
            // Arrange
            const text = 'Call us at 123-456-7890 or 555-123-4567';

            // Act
            const result = redactPhones(text);

            // Assert
            expect(result).toBe('Call us at [PHONE_REDACTED] or [PHONE_REDACTED]');
        });

        it('should redact phone with country code', () => {
            // Arrange
            const text = 'International: 1-123-456-7890';

            // Act
            const result = redactPhones(text);

            // Assert
            expect(result).toBe('International: [PHONE_REDACTED]');
        });

        it('should handle text without phone numbers', () => {
            // Arrange
            const text = 'No phone numbers here.';

            // Act
            const result = redactPhones(text);

            // Assert
            expect(result).toBe(text);
        });
    });

    describe('redactSensitiveURLs', () => {
        it('should redact credentials in URLs', () => {
            // Arrange
            const text = 'Connection: https://admin:password123@database.example.com';

            // Act
            const result = redactSensitiveURLs(text);

            // Assert
            expect(result).toBe('Connection: https://[USER_REDACTED]:[PASS_REDACTED]@database.example.com');
        });

        it('should handle multiple URLs with credentials', () => {
            // Arrange
            const text = 'http://user1:pass1@site1.com and https://user2:pass2@site2.com';

            // Act
            const result = redactSensitiveURLs(text);

            // Assert
            expect(result).toBe('http://[USER_REDACTED]:[PASS_REDACTED]@site1.com and https://[USER_REDACTED]:[PASS_REDACTED]@site2.com');
        });

        it('should not modify URLs without credentials', () => {
            // Arrange
            const text = 'Visit https://example.com for more info.';

            // Act
            const result = redactSensitiveURLs(text);

            // Assert
            expect(result).toBe(text);
        });
    });

    describe('sanitize', () => {
        it('should apply all sanitization rules when enabled', () => {
            // Arrange
            const text = `
                Contact: user@example.com
                IP: 192.168.1.100
                GUID: 550e8400-e29b-41d4-a716-446655440000
                Phone: 123-456-7890
                URL: http://admin:secret123@db.com
            `;

            // Act
            const result = sanitize(text, true);

            // Assert
            expect(result).toContain('[EMAIL_REDACTED]');
            expect(result).toContain('192.168.xxx.xxx');
            expect(result).toContain('550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
            expect(result).toContain('[PHONE_REDACTED]');
            expect(result).toContain('[USER_REDACTED]:[PASS_REDACTED]');
        });

        it('should not sanitize when disabled', () => {
            // Arrange
            const text = 'user@example.com 192.168.1.100';

            // Act
            const result = sanitize(text, false);

            // Assert
            expect(result).toBe(text);
        });

        it('should handle empty text', () => {
            // Arrange
            const text = '';

            // Act
            const result = sanitize(text, true);

            // Assert
            expect(result).toBe('');
        });

        it('should handle text with no PII', () => {
            // Arrange
            const text = 'This is a safe message with no personal information.';

            // Act
            const result = sanitize(text, true);

            // Assert
            expect(result).toBe(text);
        });
    });

    describe('sanitizeObject', () => {
        it('should sanitize string values in object', () => {
            // Arrange
            const obj = {
                message: 'Contact user@example.com',
                ip: '192.168.1.100',
                guid: '550e8400-e29b-41d4-a716-446655440000'
            };

            // Act
            const result = sanitizeObject(obj, true);

            // Assert
            expect(result.message).toBe('Contact [EMAIL_REDACTED]');
            expect(result.ip).toBe('192.168.xxx.xxx');
            expect(result.guid).toBe('550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
        });

        it('should sanitize nested objects', () => {
            // Arrange
            const obj = {
                user: {
                    email: 'test@example.com',
                    address: {
                        ip: '10.0.0.1'
                    }
                }
            };

            // Act
            const result = sanitizeObject(obj, true);

            // Assert
            expect(result.user.email).toBe('[EMAIL_REDACTED]');
            expect(result.user.address.ip).toBe('10.0.xxx.xxx');
        });

        it('should sanitize arrays', () => {
            // Arrange
            const obj = {
                emails: ['user1@example.com', 'user2@example.com'],
                ips: ['192.168.1.1', '192.168.1.2']
            };

            // Act
            const result = sanitizeObject(obj, true);

            // Assert
            expect(result.emails).toEqual(['[EMAIL_REDACTED]', '[EMAIL_REDACTED]']);
            expect(result.ips).toEqual(['192.168.xxx.xxx', '192.168.xxx.xxx']);
        });

        it('should not modify non-string values', () => {
            // Arrange
            const obj = {
                count: 42,
                active: true,
                timestamp: null,
                metadata: undefined
            };

            // Act
            const result = sanitizeObject(obj, true);

            // Assert
            expect(result.count).toBe(42);
            expect(result.active).toBe(true);
            expect(result.timestamp).toBeNull();
            expect(result.metadata).toBeUndefined();
        });

        it('should not sanitize when disabled', () => {
            // Arrange
            const obj = {
                email: 'user@example.com',
                ip: '192.168.1.100'
            };

            // Act
            const result = sanitizeObject(obj, false);

            // Assert
            expect(result).toEqual(obj);
        });

        it('should handle complex nested structures', () => {
            // Arrange
            const obj = {
                data: [
                    {
                        user: { email: 'user1@example.com', id: 123 },
                        logs: ['Message from 192.168.1.1', 'GUID: 550e8400-e29b-41d4-a716-446655440000']
                    },
                    {
                        user: { email: 'user2@example.com', id: 456 },
                        logs: ['Call 123-456-7890']
                    }
                ]
            };

            // Act
            const result = sanitizeObject(obj, true);

            // Assert
            expect(result.data[0].user.email).toBe('[EMAIL_REDACTED]');
            expect(result.data[0].user.id).toBe(123);
            expect(result.data[0].logs[0]).toBe('Message from 192.168.xxx.xxx');
            expect(result.data[0].logs[1]).toBe('GUID: 550e8400-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
            expect(result.data[1].user.email).toBe('[EMAIL_REDACTED]');
            expect(result.data[1].logs[0]).toBe('Call [PHONE_REDACTED]');
        });

        it('should return original value for primitive types', () => {
            // Act & Assert
            expect(sanitizeObject('test@example.com', true)).toBe('[EMAIL_REDACTED]');
            expect(sanitizeObject(123, true)).toBe(123);
            expect(sanitizeObject(true, true)).toBe(true);
            expect(sanitizeObject(null, true)).toBeNull();
            expect(sanitizeObject(undefined, true)).toBeUndefined();
        });
    });
});
