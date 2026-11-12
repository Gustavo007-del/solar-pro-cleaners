import logging
from datetime import date
from html import escape
from pathlib import Path
from string import Template
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, TypeAdapter, ValidationError
from sqlalchemy.exc import OperationalError, TimeoutError

from app.api.dependencies import AppSettings
from app.core.database import Database
from app.modules.business.schemas import BusinessPhone, SupportEmail
from app.modules.business.service import find_active_business

api = APIRouter(tags=["Business Information"])
web = APIRouter(include_in_schema=False)
logger = logging.getLogger(__name__)
page = Template(Path(__file__).with_name("public_page.html").read_text(encoding="utf-8"))
public_email = TypeAdapter(SupportEmail)
public_phone = TypeAdapter(BusinessPhone)
default_deletion_phone = "+919061444017"


class PrivacySection(BaseModel):
    title: str
    text: str


class PrivacyPolicy(BaseModel):
    title: str = "Privacy Policy"
    effective_date: date | None
    contact_path: str = "/contact-us"
    sections: list[PrivacySection]


class PublicContact(BaseModel):
    business_name: str
    support_email: str | None = None
    primary_phone: str | None = None
    alternate_phone: str | None = None
    business_address: str | None = None
    privacy_policy_path: str = "/privacy-policy"


POLICY = (
    ("Information we use",
     "Solar Care uses the contact details, service addresses, booking details and service notes you provide. "
     "If you choose to share coordinates, we use them to check coverage and identify the service location. "
     "The service does not track your location in the background."),
    ("How we use it",
     "We use this information to manage accounts, arrange and deliver cleaning visits, provide support and secure the service. "
     "We keep session records, limited request logs and administrative audit records for security and operations."),
    ("Who can access it",
     "Authorized staff access customer information for their assigned duties. "
     "Information needed to carry out a visit may be shared with the technician responsible for that work. "
     "Hosting and database providers process information to operate the service."),
    ("Push notifications",
     "If you turn on push notifications, we use a device token and delivery records to send announcements and service "
     "updates through Expo and your phone’s push service. You can turn notifications off in Solar Care or your phone settings. "
     "A message may be visible on your lock screen depending on those settings."),
    ("Retention and account requests",
     "We retain account and service records as needed for operations, security and applicable obligations. "
     "Deactivating an account can end access while preserving booking history. Contact us to ask about access, correction, "
     "deactivation or deletion of your information. We may need to verify your identity."),
)


@api.get("/privacy-policy")
def privacy_policy(settings: AppSettings) -> PrivacyPolicy:
    return PrivacyPolicy(
        effective_date=settings.public_privacy_effective_date,
        sections=[PrivacySection(title=title, text=text) for title, text in POLICY],
    )


def published_contact(request: Request) -> PublicContact:
    result = PublicContact(business_name="Solar Care")
    database: Database | None = request.app.state.database
    if database is None:
        return result
    try:
        with database.sessions() as db:
            business = find_active_business(db)
            if business is None:
                return result
            result.business_name = business.business_name
            result.business_address = business.business_address
            for field, validator in (
                ("support_email", public_email), ("primary_phone", public_phone), ("alternate_phone", public_phone),
            ):
                value = getattr(business, field)
                if value is not None:
                    try:
                        setattr(result, field, validator.validate_python(value))
                    except ValidationError:
                        continue
    except (OperationalError, TimeoutError):
        # Keep public policy and support navigation available during a database outage.
        logger.warning("database_issue", extra={
            "event": "database_issue", "request_id": request.state.request_id,
        })
    return result


@api.get("/contact", include_in_schema=False)
@api.get("/contact-us")
def contact_us(request: Request) -> PublicContact:
    return published_contact(request)


def render(title: str, content: str) -> HTMLResponse:
    return HTMLResponse(page.substitute(title=escape(title), content=content), headers={
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
        "Cache-Control": "no-store",
    })


@web.api_route("/", methods=["GET", "HEAD"])
def public_home() -> HTMLResponse:
    return render("Solar Care support", """
        <h1>Solar Care support</h1>
        <div class="cards">
          <a class="card" href="/privacy-policy"><strong>Privacy Policy</strong>
            <span>How we handle your account, booking and location information.</span></a>
          <a class="card" href="/contact-us"><strong>Contact Us</strong>
            <span>Get help with a cleaning visit, your account or a privacy request.</span></a>
          <a class="card" href="/delete-account"><strong>Request account deletion</strong>
            <span>Ask us to delete your Solar Care account and associated data.</span></a>
        </div>
    """)


@web.api_route("/privacy-policy", methods=["GET", "HEAD"])
def privacy_page(settings: AppSettings) -> HTMLResponse:
    policy = privacy_policy(settings)
    effective = policy.effective_date
    status = f"Effective {effective.isoformat()}" if effective else "Draft pending business approval"
    sections = "".join(f"<section><h2>{escape(item.title)}</h2><p>{escape(item.text)}</p></section>"
                       for item in policy.sections)
    return render(policy.title, f"""
        <h1>{escape(policy.title)}</h1>
        <p class="muted">{status}</p>
        {sections}
        <p><a href="/delete-account">Request account and data deletion</a></p>
        <p><a href="/contact-us">Contact us about privacy</a></p>
    """)


@web.api_route("/contact", methods=["GET", "HEAD"])
@web.api_route("/contact-us", methods=["GET", "HEAD"])
def contact_page(request: Request) -> HTMLResponse:
    contact = published_contact(request)
    details = []
    if contact.support_email:
        email = contact.support_email
        details.append(f'<dt>Email</dt><dd><a href="mailto:{quote(email, safe="@")}">{escape(email)}</a></dd>')
    for label, phone in (("Phone", contact.primary_phone), ("Alternate phone", contact.alternate_phone)):
        if phone:
            details.append(f'<dt>{label}</dt><dd><a href="tel:{escape(phone)}">{escape(phone)}</a></dd>')
    if contact.business_address:
        details.append(f'<dt>Business address</dt><dd class="address">{escape(contact.business_address)}</dd>')
    listing = "<dl>" + "".join(details) + "</dl>" if details else "<p>Support contact details are currently unavailable.</p>"
    return render("Contact Us", f"""
        <h1>Contact Us</h1>
        <p class="muted">{escape(contact.business_name)}</p>
        {listing}
        <p><a href="/delete-account">Request account and data deletion</a></p>
        <p><a href="/privacy-policy">Read our Privacy Policy</a></p>
    """)


@web.api_route("/delete-account", methods=["GET", "HEAD"])
def delete_account_page(request: Request) -> HTMLResponse:
    contact = published_contact(request)
    subject = "Solar Care account and data deletion request"
    message = "I would like to request deletion of my Solar Care account and associated data."
    whatsapp = f"https://wa.me/{default_deletion_phone[1:]}?text={quote(message)}"
    phone = contact.primary_phone or default_deletion_phone
    email_option = ""
    if contact.support_email:
        email = quote(contact.support_email, safe="@")
        email_link = f"mailto:{email}?subject={quote(subject)}&body={quote(message)}"
        email_option = f'<li><a href="{escape(email_link)}">Email a deletion request</a></li>'

    return render("Request account deletion", f"""
        <h1>Request account and data deletion</h1>
        <p>Use one of the options below to ask Solar Care to delete your account and associated data.
          You can request deletion even if you’ve uninstalled the app.</p>
        <ul>
          <li><a href="{escape(whatsapp)}">Send a deletion request on WhatsApp</a></li>
          {email_option}
          <li><a href="tel:{escape(phone)}">Call Solar Care support at {escape(phone)}</a></li>
        </ul>
        <p>Include the phone number registered with your Solar Care account so support can find it.
          We’ll verify that the account belongs to you before processing the request.</p>
        <h2>What happens to your data</h2>
        <p>We’ll process your request for your account and associated data, including saved addresses and
          notification registrations. Some records may be kept where required for legal, security or dispute
          resolution reasons. Support will explain what applies to your request and confirm the outcome.</p>
        <p><a href="/privacy-policy">Read the Solar Care Privacy Policy</a></p>
    """)

