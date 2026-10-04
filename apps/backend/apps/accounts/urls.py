from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import (
    AadhaarMockVerifyView, MeView, OTPRequestView, OTPVerifyView, StaffLoginView,
)

urlpatterns = [
    path('staff/login/', StaffLoginView.as_view(), name='staff-login'),
    path('otp/request/', OTPRequestView.as_view(), name='otp-request'),
    path('otp/verify/', OTPVerifyView.as_view(), name='otp-verify'),
    path('identity/aadhaar/verify/', AadhaarMockVerifyView.as_view(), name='aadhaar-mock-verify'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('me/', MeView.as_view(), name='me'),
]
