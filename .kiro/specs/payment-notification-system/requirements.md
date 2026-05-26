# Payment Notification System - Requirements Document

## Introduction

The Payment Notification System is a point-of-sale (POS) solution designed for retail shops to receive and process payment notifications from banks. The system consists of three main components: an ESP32-based device that displays QR codes and notifies customers of successful payments, a backend API that receives transaction data from banks and matches transaction codes, and a web dashboard for managing daily revenue, monitoring device status, and generating QR codes.

The system enables seamless payment processing by displaying a unique QR code for each transaction, receiving payment confirmation from the bank, and immediately notifying the customer through visual display and audio feedback.

## Glossary

- **Device**: ESP32-based hardware unit with display and audio capabilities deployed at the point of sale
- **Backend**: Server-side API that receives bank transaction data and manages payment matching
- **Dashboard**: Web-based management interface for shop operators
- **Transaction_Code**: Unique identifier generated for each payment request, used to match incoming bank transactions
- **QR_Code**: Machine-readable code displayed on the Device containing transaction information
- **Payment_Notification**: Signal sent from Backend to Device when a matching transaction is confirmed
- **Transaction_History**: Record of all payments processed through the system
- **Device_Status**: Current operational state of the Device (online, offline, error)
- **Daily_Revenue**: Aggregated sum of all successful payments within a 24-hour period
- **Bank_Transaction_Data**: Payment information received from the bank including transaction code, amount, and timestamp
- **Audio_Notification**: Sound played on the Device to alert of successful payment
- **Display**: OLED screen on the Device showing QR code and payment information
- **API_Endpoint**: HTTP interface through which the Backend receives bank transaction data
- **Session**: Active connection between Device and Backend

## Requirements

### Requirement 1: Generate Unique Transaction Codes

**User Story:** As a shop operator, I want the system to generate unique transaction codes for each payment request, so that I can match incoming bank transactions to specific sales.

#### Acceptance Criteria

1. WHEN a new payment request is initiated, THE Backend SHALL generate a unique Transaction_Code
2. THE Transaction_Code SHALL be alphanumeric and between 8 and 16 characters in length
3. THE Transaction_Code SHALL be unique across all active transactions within a 24-hour period
4. THE Transaction_Code SHALL be returned to the Device within 500 milliseconds of request
5. WHEN the same Transaction_Code is requested twice, THE Backend SHALL return the same code if the original transaction is still active (within 30 minutes)

---

### Requirement 2: Display QR Code on Device

**User Story:** As a customer, I want to see a QR code on the device display, so that I can scan it to initiate payment.

#### Acceptance Criteria

1. WHEN a Transaction_Code is generated, THE Device SHALL encode it into a QR_Code
2. THE Device SHALL display the QR_Code on the OLED Display within 1 second of receiving the Transaction_Code
3. THE QR_Code SHALL be clearly visible and scannable from a distance of at least 30 centimeters
4. THE QR_Code SHALL remain displayed until a Payment_Notification is received or the transaction expires
5. IF the transaction expires (30 minutes without payment), THE Device SHALL clear the QR_Code and display a timeout message

---

### Requirement 3: Receive Bank Transaction Data

**User Story:** As a system administrator, I want the Backend to receive transaction data from the bank, so that payment confirmations can be processed.

#### Acceptance Criteria

1. THE Backend SHALL expose an API_Endpoint that accepts HTTP POST requests containing Bank_Transaction_Data
2. WHEN Bank_Transaction_Data is received, THE Backend SHALL validate that it contains Transaction_Code, Amount, and Timestamp fields
3. IF required fields are missing, THE Backend SHALL return an HTTP 400 error with a descriptive error message
4. THE Backend SHALL accept Bank_Transaction_Data within 5 seconds of the bank sending it
5. THE Backend SHALL log all received Bank_Transaction_Data for audit purposes

---

### Requirement 4: Match Transaction Codes

**User Story:** As the system, I want to match incoming bank transactions with generated transaction codes, so that payments can be correctly attributed to sales.

#### Acceptance Criteria

1. WHEN Bank_Transaction_Data is received, THE Backend SHALL search for a matching active Transaction_Code
2. IF a matching Transaction_Code is found, THE Backend SHALL mark the transaction as confirmed
3. IF no matching Transaction_Code is found, THE Backend SHALL log the unmatched transaction and alert the administrator
4. THE Backend SHALL complete the matching process within 1 second of receiving Bank_Transaction_Data
5. WHILE a transaction is being matched, THE Backend SHALL prevent duplicate processing of the same Bank_Transaction_Data

---

### Requirement 5: Send Payment Notification to Device

**User Story:** As a customer, I want to receive immediate notification when my payment is confirmed, so that I know the transaction was successful.

#### Acceptance Criteria

1. WHEN a transaction is successfully matched, THE Backend SHALL send a Payment_Notification to the Device
2. THE Payment_Notification SHALL include the confirmed Amount and Transaction_Code
3. THE Backend SHALL send the Payment_Notification within 2 seconds of transaction matching
4. IF the Device is offline, THE Backend SHALL queue the Payment_Notification and retry delivery for up to 5 minutes
5. WHEN the Device receives a Payment_Notification, THE Device SHALL acknowledge receipt to the Backend

---

### Requirement 6: Display Received Amount on Device

**User Story:** As a customer, I want to see the payment amount displayed on the device, so that I can verify the transaction is correct.

#### Acceptance Criteria

1. WHEN a Payment_Notification is received, THE Device SHALL display the confirmed Amount on the OLED Display
2. THE Amount SHALL be displayed in the local currency format with appropriate decimal places
3. THE Device SHALL display the Amount within 500 milliseconds of receiving the Payment_Notification
4. THE Amount SHALL remain visible for at least 5 seconds before clearing
5. THE Display SHALL show the Amount in a font size that is readable from at least 1 meter away

---

### Requirement 7: Play Audio Notification

**User Story:** As a customer, I want to hear a success sound when my payment is confirmed, so that I have immediate audio feedback.

#### Acceptance Criteria

1. WHEN a Payment_Notification is received, THE Device SHALL play an Audio_Notification sound
2. THE Audio_Notification SHALL be a distinct success tone (e.g., pleasant chime or beep)
3. THE Audio_Notification SHALL play within 500 milliseconds of receiving the Payment_Notification
4. THE Audio_Notification SHALL have a duration between 0.5 and 2 seconds
5. THE Audio_Notification SHALL have a volume level between 60 and 80 decibels (measured at 1 meter)
6. WHERE the Device is configured to silent mode, THE Audio_Notification SHALL not play

---

### Requirement 8: Track Device Online/Offline Status

**User Story:** As a shop operator, I want to know if the payment device is online and operational, so that I can ensure customers can make payments.

#### Acceptance Criteria

1. THE Device SHALL send a heartbeat signal to the Backend every 30 seconds
2. WHEN the Backend receives a heartbeat signal, THE Backend SHALL mark the Device as online
3. IF the Backend does not receive a heartbeat signal for 2 minutes, THE Backend SHALL mark the Device as offline
4. WHEN the Device_Status changes from online to offline, THE Backend SHALL log the status change
5. WHEN the Device_Status changes from offline to online, THE Backend SHALL log the status change and notify the Dashboard

---

### Requirement 9: Display Device Status on Dashboard

**User Story:** As a shop operator, I want to see the current status of the payment device on the dashboard, so that I can quickly identify if there are connectivity issues.

#### Acceptance Criteria

1. THE Dashboard SHALL display the current Device_Status (online or offline)
2. WHEN the Device_Status changes, THE Dashboard SHALL update the status display within 5 seconds
3. IF the Device is offline, THE Dashboard SHALL display a visual indicator (e.g., red icon or warning message)
4. IF the Device is online, THE Dashboard SHALL display a visual indicator (e.g., green icon)
5. THE Dashboard SHALL display the timestamp of the last successful heartbeat from the Device

---

### Requirement 10: Display Daily Revenue Summary

**User Story:** As a shop operator, I want to see the total revenue for the current day on the dashboard, so that I can monitor sales performance.

#### Acceptance Criteria

1. THE Dashboard SHALL calculate and display the Daily_Revenue as the sum of all confirmed transaction amounts
2. THE Daily_Revenue calculation SHALL include only transactions with a timestamp within the current calendar day
3. THE Dashboard SHALL update the Daily_Revenue display within 5 seconds of a new transaction being confirmed
4. THE Dashboard SHALL display the Daily_Revenue in the local currency format
5. THE Dashboard SHALL display the number of transactions that contributed to the Daily_Revenue

---

### Requirement 11: Generate QR Codes on Dashboard

**User Story:** As a shop operator, I want to generate QR codes from the dashboard, so that I can quickly create payment requests without using the device.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a button or interface element to generate a new QR_Code
2. WHEN the generate button is clicked, THE Dashboard SHALL request a new Transaction_Code from the Backend
3. THE Dashboard SHALL display the generated QR_Code within 2 seconds
4. THE Dashboard SHALL allow the operator to specify a custom Amount for the generated QR_Code
5. THE Dashboard SHALL provide an option to download or print the generated QR_Code

---

### Requirement 12: View Transaction History

**User Story:** As a shop operator, I want to view a history of all transactions, so that I can audit sales and troubleshoot issues.

#### Acceptance Criteria

1. THE Dashboard SHALL display a Transaction_History list showing all processed transactions
2. EACH transaction entry SHALL include Transaction_Code, Amount, Timestamp, and Status (confirmed/pending/failed)
3. THE Dashboard SHALL allow filtering Transaction_History by date range
4. THE Dashboard SHALL allow sorting Transaction_History by Amount, Timestamp, or Status
5. THE Dashboard SHALL display at least 100 transactions per page with pagination support
6. THE Dashboard SHALL provide an export function to download Transaction_History as CSV

---

### Requirement 13: Establish Device-Backend Communication

**User Story:** As a system, I want the Device and Backend to communicate reliably, so that payment notifications are delivered promptly.

#### Acceptance Criteria

1. THE Device SHALL establish a persistent connection to the Backend using HTTP or WebSocket protocol
2. WHEN the Device starts, THE Device SHALL attempt to connect to the Backend within 10 seconds
3. IF the initial connection fails, THE Device SHALL retry connection every 5 seconds for up to 5 minutes
4. WHILE connected, THE Device SHALL maintain the connection with periodic heartbeat signals
5. IF the connection is lost, THE Device SHALL attempt to reconnect automatically

---

### Requirement 14: Handle Transaction Expiration

**User Story:** As the system, I want to automatically expire transactions that do not receive payment confirmation, so that resources are not wasted on stale transactions.

#### Acceptance Criteria

1. WHEN a Transaction_Code is generated, THE Backend SHALL set an expiration time of 30 minutes
2. IF no Payment_Notification is received before the expiration time, THE Backend SHALL mark the transaction as expired
3. WHEN a transaction expires, THE Device SHALL clear the QR_Code display and show an expiration message
4. THE Backend SHALL not process Bank_Transaction_Data for expired Transaction_Codes
5. THE Backend SHALL log all expired transactions for audit purposes

---

### Requirement 15: Validate Transaction Amount

**User Story:** As the system, I want to validate that the received payment amount matches the requested amount, so that payment discrepancies are detected.

#### Acceptance Criteria

1. WHEN Bank_Transaction_Data is received, THE Backend SHALL compare the received Amount with the requested Amount
2. IF the amounts match exactly, THE Backend SHALL proceed with transaction confirmation
3. IF the amounts do not match, THE Backend SHALL log the discrepancy and alert the administrator
4. WHERE the system is configured to allow partial payments, THE Backend SHALL accept amounts within a configured tolerance (e.g., ±5%)
5. IF a discrepancy is detected, THE Backend SHALL NOT send a Payment_Notification to the Device until the discrepancy is resolved

---

### Requirement 16: Store Transaction History

**User Story:** As the system, I want to persistently store all transaction data, so that transaction history can be retrieved and audited.

#### Acceptance Criteria

1. THE Backend SHALL store all transaction data in a persistent database
2. EACH stored transaction record SHALL include Transaction_Code, Amount, Timestamp, Status, and Device_ID
3. THE Backend SHALL store transaction records within 1 second of transaction confirmation
4. THE Backend SHALL retain transaction records for at least 1 year
5. THE Backend SHALL provide query capabilities to retrieve transactions by date range, amount, or status

---

### Requirement 17: Secure API Communication

**User Story:** As a system administrator, I want the communication between Device and Backend to be secure, so that transaction data is protected from unauthorized access.

#### Acceptance Criteria

1. THE Backend API_Endpoint SHALL use HTTPS protocol with TLS 1.2 or higher
2. THE Device SHALL verify the Backend's SSL certificate before sending sensitive data
3. THE Backend SHALL authenticate all requests from the Device using an API key or token
4. THE Backend SHALL validate that all incoming Bank_Transaction_Data comes from authorized bank sources
5. THE Backend SHALL encrypt all transaction data in transit and at rest

---

### Requirement 18: Handle Network Errors Gracefully

**User Story:** As the system, I want to handle network errors gracefully, so that temporary connectivity issues do not result in lost transactions.

#### Acceptance Criteria

1. IF the Device fails to send a heartbeat signal, THE Device SHALL retry the heartbeat within 10 seconds
2. IF the Backend fails to send a Payment_Notification, THE Backend SHALL queue the notification and retry for up to 5 minutes
3. IF the Backend receives a duplicate Bank_Transaction_Data request, THE Backend SHALL detect the duplicate and not process it twice
4. WHEN a network error occurs, THE Backend SHALL log the error with timestamp and error details
5. WHEN network connectivity is restored, THE Device SHALL automatically resynchronize with the Backend

---

### Requirement 19: Configure Device Settings

**User Story:** As a shop operator, I want to configure device settings from the dashboard, so that I can customize the device behavior without physical access.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a settings interface to configure Device parameters
2. THE configurable parameters SHALL include audio volume, display brightness, and transaction timeout duration
3. WHEN settings are changed on the Dashboard, THE Backend SHALL send the new configuration to the Device
4. THE Device SHALL apply the new configuration within 5 seconds of receiving it
5. THE Device SHALL persist the configuration settings across power cycles

---

### Requirement 20: Log System Events

**User Story:** As a system administrator, I want all system events to be logged, so that I can troubleshoot issues and audit system behavior.

#### Acceptance Criteria

1. THE Backend SHALL log all significant events including transaction confirmations, errors, and status changes
2. EACH log entry SHALL include timestamp, event type, event details, and affected entity (Device_ID or Transaction_Code)
3. THE Backend SHALL store logs in a persistent storage system
4. THE Backend SHALL provide a log viewer interface on the Dashboard
5. THE Backend SHALL retain logs for at least 90 days

---

### Requirement 21: Display Transaction Status on Device

**User Story:** As a customer, I want to see the transaction status on the device, so that I know whether my payment is pending, confirmed, or failed.

#### Acceptance Criteria

1. WHEN a Transaction_Code is generated, THE Device SHALL display a "Waiting for Payment" status message
2. WHEN a Payment_Notification is received, THE Device SHALL display a "Payment Confirmed" status message
3. IF a transaction expires without payment, THE Device SHALL display a "Payment Timeout" status message
4. IF a payment error occurs, THE Device SHALL display an error message with a brief description
5. THE status messages SHALL be displayed in a clear, readable font on the OLED Display

---

### Requirement 22: Support Multiple Devices

**User Story:** As a shop operator with multiple locations, I want to manage multiple payment devices from a single dashboard, so that I can monitor all locations from one interface.

#### Acceptance Criteria

1. THE Backend SHALL support multiple Device connections simultaneously
2. THE Dashboard SHALL display a list of all connected Devices with their respective status and Daily_Revenue
3. THE Dashboard SHALL allow filtering and sorting the Device list by location, status, or revenue
4. WHEN a transaction is processed, THE Backend SHALL correctly attribute it to the correct Device
5. THE Dashboard SHALL display separate Daily_Revenue totals for each Device and a combined total

---

### Requirement 23: Handle Concurrent Transactions

**User Story:** As the system, I want to handle multiple concurrent transactions, so that multiple customers can make payments simultaneously.

#### Acceptance Criteria

1. THE Backend SHALL support processing multiple transactions concurrently without data corruption
2. WHEN multiple Transaction_Codes are requested simultaneously, THE Backend SHALL generate unique codes for each request
3. WHEN multiple Payment_Notifications are sent simultaneously, THE Backend SHALL deliver all notifications without loss
4. THE Backend SHALL maintain transaction isolation to prevent one transaction from affecting another
5. THE Backend SHALL process up to 100 concurrent transactions without performance degradation

---

### Requirement 24: Provide System Health Monitoring

**User Story:** As a system administrator, I want to monitor the health of the system, so that I can identify and resolve issues proactively.

#### Acceptance Criteria

1. THE Dashboard SHALL display system health metrics including API response time, database connection status, and error rate
2. THE Dashboard SHALL display the number of active Devices and active transactions
3. THE Dashboard SHALL display the average transaction processing time
4. IF any system metric exceeds a configured threshold, THE Dashboard SHALL display a warning or alert
5. THE Dashboard SHALL provide historical charts showing system metrics over time

---

### Requirement 25: Support Offline Mode for Device

**User Story:** As a shop operator, I want the device to continue functioning when the backend is temporarily unavailable, so that payment processing is not interrupted.

#### Acceptance Criteria

1. WHEN the Device loses connection to the Backend, THE Device SHALL continue to generate and display QR_Codes
2. WHILE offline, THE Device SHALL store generated Transaction_Codes locally
3. WHEN the Device reconnects to the Backend, THE Device SHALL synchronize all locally stored Transaction_Codes
4. WHILE offline, THE Device SHALL display an "Offline Mode" indicator on the OLED Display
5. WHEN the Device is in offline mode, THE Device SHALL not play Audio_Notifications for payments (since confirmation cannot be received)

---

## Non-Functional Requirements

### Performance

- Transaction matching SHALL complete within 1 second
- QR code generation and display SHALL complete within 1 second
- Dashboard updates SHALL reflect changes within 5 seconds
- API response time SHALL not exceed 500 milliseconds for 95% of requests

### Reliability

- System uptime SHALL be at least 99.5% during business hours
- Payment notifications SHALL be delivered with 99.9% success rate
- Transaction data SHALL not be lost due to system failures

### Security

- All communication SHALL use HTTPS with TLS 1.2 or higher
- Transaction data SHALL be encrypted at rest
- API access SHALL require authentication
- System SHALL comply with PCI DSS requirements for payment data

### Scalability

- System SHALL support up to 1000 concurrent transactions
- System SHALL support up to 100 devices per backend instance
- Database SHALL efficiently handle queries on transaction history with millions of records

### Usability

- Dashboard interface SHALL be intuitive and require minimal training
- Device display SHALL be readable from at least 1 meter away
- QR codes SHALL be scannable from at least 30 centimeters away

### Maintainability

- Code SHALL follow established coding standards and best practices
- System SHALL provide comprehensive logging for troubleshooting
- System SHALL support easy deployment and updates

