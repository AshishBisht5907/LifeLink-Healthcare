from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('notifications', '0002_notification_dedupe_key'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='notification_type',
            field=models.CharField(
                choices=[
                    ('NEW_CONSENT', 'New Consent Request'),
                    ('REPORT_READY', 'Report Ready'),
                    ('REQUEST_APPROVED', 'Request Approved'),
                    ('REQUEST_REJECTED', 'Request Rejected'),
                    ('REQUEST_POSTPONED', 'Request Postponed'),
                    ('REFERRAL_ACCEPTED', 'Referral Accepted'),
                    ('REFERRAL_REJECTED', 'Referral Rejected'),
                    ('REFERRAL_CREATED', 'Referral Created'),
                    ('TRANSFER_COMPLETED', 'Transfer Completed'),
                    ('STATUS_UPDATE', 'Status Update'),
                    ('REQUEST_COMPLETED', 'Request Completed'),
                    ('GENERAL', 'General'),
                ],
                max_length=30,
            ),
        ),
    ]
