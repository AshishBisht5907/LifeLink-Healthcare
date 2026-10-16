from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='otprequest',
            name='purpose',
            field=models.CharField(
                choices=[
                    ('LOGIN', 'Login'),
                    ('REGISTER', 'Registration'),
                    ('REGISTER_FAMILY', 'Family Registration'),
                    ('CLAIM_PROFILE', 'Claim Unclaimed Profile'),
                ],
                max_length=20,
            ),
        ),
    ]
