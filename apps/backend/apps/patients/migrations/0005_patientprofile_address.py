from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('patients', '0004_patientaccessgrant'),
    ]

    operations = [
        migrations.AddField(
            model_name='patientprofile',
            name='address',
            field=models.TextField(blank=True, default=''),
        ),
    ]
