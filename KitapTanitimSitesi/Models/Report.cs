using System.ComponentModel.DataAnnotations;

namespace KitapTanitimSitesi.Models
{
    // ---- YENİ: Şikayet + Talep (Faz Ekstra 2.0) ----
    public class Report
    {
        [Key]
        public int Id { get; set; }

        // "Şikayet" veya "Talep"
        [Required, MaxLength(20)]
        public string Type { get; set; } = string.Empty;

        // Yorum şikayetlerinde dolu, genel taleplerde boş
        public int? TargetRatingID { get; set; }

        [Required]
        public int ReporterUserID { get; set; }

        [Required, MaxLength(5000)]
        public string Message { get; set; } = string.Empty;

        // "Beklemede", "İnceleniyor", "Çözüldü", "Reddedildi"
        [Required, MaxLength(20)]
        public string Status { get; set; } = "Beklemede";

        [MaxLength(2000)]
        public string? AdminNote { get; set; }

        [MaxLength(5000)]
        public string? UserMessage { get; set; }

        public int? ReviewedByAdminId { get; set; }
        public DateTime? ReviewedAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public BookRating? TargetRating { get; set; }
        public User? ReporterUser { get; set; }
        public User? ReviewedByAdmin { get; set; }
        public ICollection<UserModerationAction> ModerationActions { get; set; } = new List<UserModerationAction>();
    }
}