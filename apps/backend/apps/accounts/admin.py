from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from apps.accounts.models import User, OTPRequest, IdentityVerification


@admin.register(User)
class LifeLinkUserAdmin(UserAdmin):
    list_display = ('username', 'phone', 'role', 'is_active', 'mfa_enabled')
    fieldsets = UserAdmin.fieldsets + (
        ('LifeLink', {'fields': ('role', 'phone', 'mfa_enabled', 'mfa_secret', 'must_change_password')}),
    )


admin.site.register(OTPRequest)
admin.site.register(IdentityVerification)
